import { createClient } from "@supabase/supabase-js";
import { generateVideoRoundup } from "./shared/generate-video-roundup";

/**
 * Nightly background function — generates yesterday's video roundup
 * for every (topic, lang) bucket that has at least 2 transcribed videos
 * and doesn't already have a roundup row.
 *
 * The roundup is KEYED to roundup_date=yesterday (the unique index in
 * `video_roundups`), but `generateVideoRoundup` internally pulls source
 * material from a 48 h window — i.e. videos with published_date in
 * [day-before-yesterday, yesterday] inclusive. See WINDOW_DAYS in
 * `src/lib/generate-video-roundup.ts`.
 *
 * Mirror of `cron-daily-summary-background.ts`: same wall budget, same
 * MAX_TOPICS_PER_RUN cap, same fast-skip pattern via a single bulk
 * SELECT of existing rows. Multiple ticks per night cover the full set
 * even when each tick only processes 5 topics.
 *
 * Triggered externally via cron-job.org (no Netlify schedule declared
 * here — the project moved schedule management out of netlify.toml in
 * v1.88, see SPEC).
 */

const WALL_MS = 840_000;
const BUDGET_MS = Number(process.env.VIDEO_ROUNDUP_BUDGET_MS ?? 810_000);
const SAFETY_MS = 15_000;

/**
 * Hard cap on the number of topics processed per run (each topic
 * generates up to 2 buckets — one per lang). With ~10-30 s per OpenAI
 * call, 12 topics × 2 langs = 24 calls comfortably fits in the 14-min
 * effective wall (BUDGET_MS - SAFETY_MS). Bumped from the original 5
 * once the catalog grew past 30 topics: at 5/run it took 8 ticks to
 * drain a single date, which never finished if the cron only fired
 * 1-2 times a night.
 */
const MAX_TOPICS_PER_RUN = Number(process.env.VIDEO_ROUNDUP_MAX_TOPICS_PER_RUN ?? 12);

const ALL_LANGS = ["en", "fr"] as const;

/**
 * Compute "yesterday" in the editorial timezone (Europe/Paris) rather
 * than UTC. A roundup keyed to date X is meant to summarize the day X
 * as the user thinks of it (in their local TZ), not as UTC sees it.
 *
 * Without this, a cron tick firing between 22:00 UTC and 23:59 UTC
 * (= 00:00-01:59 CET the next day) would compute `yesterday` as the
 * day BEFORE the one that just ended editorially, producing roundups
 * for the wrong date and missing the day the user actually wanted.
 *
 * The optional `ROUNDUP_DATE` env var override is honored first so the
 * cron can be re-pointed to backfill a specific historical date
 * without redeploying.
 */
const EDITORIAL_TZ = "Europe/Paris";

function todayInTz(tz: string): string {
  const fmt = new Intl.DateTimeFormat("fr-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function yesterdayInTz(tz: string): string {
  const today = todayInTz(tz);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function resolveTargetDate(): { date: string; source: "override" | "yesterday-cet" } {
  const override = (process.env.ROUNDUP_DATE ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(override)) {
    return { date: override, source: "override" };
  }
  return { date: yesterdayInTz(EDITORIAL_TZ), source: "yesterday-cet" };
}

export default async () => {
  const startedAt = Date.now();
  const deadline = startedAt + Math.min(WALL_MS, BUDGET_MS);
  const remaining = () => deadline - Date.now();
  const lines: string[] = [];

  console.log("[cron-video-roundup] Starting background function");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: topics, error: topicsErr } = await supabase
    .from("topics")
    .select("id")
    .eq("is_active", true);

  if (topicsErr) {
    console.log(`[cron-video-roundup] DB error: ${topicsErr.message}`);
    return;
  }

  if (!topics || topics.length === 0) {
    console.log("[cron-video-roundup] No active topics");
    return;
  }

  const { date: yesterday, source: dateSource } = resolveTargetDate();
  const utcNow = new Date().toISOString();
  console.log(
    `[cron-video-roundup] Found ${topics.length} active topics, max ${MAX_TOPICS_PER_RUN} per run, target_date=${yesterday} (source=${dateSource}, utc_now=${utcNow})`,
  );

  // Bulk-load existing (topic, lang) roundups for the target date so
  // the loop can fast-skip what a previous tick already wrote.
  const { data: existingRows, error: existingErr } = await supabase
    .from("video_roundups")
    .select("topic_id, lang")
    .eq("roundup_date", yesterday);

  if (existingErr) {
    console.log(`[cron-video-roundup] DB error (existing): ${existingErr.message}`);
    return;
  }

  const doneSet = new Set<string>();
  for (const r of existingRows ?? []) {
    const row = r as { topic_id: string; lang: string };
    doneSet.add(`${row.topic_id}|${row.lang}`);
  }

  // Deterministic id-sorted order so consecutive ticks naturally pick
  // up where the previous one stopped (already-done buckets get fast-
  // skipped before they consume any of the per-run cap).
  const sortedTopics = [...topics].sort((a, b) =>
    String((a as { id: string }).id).localeCompare(String((b as { id: string }).id)),
  );

  let processedTopics = 0;
  let skippedTopics = 0;
  let generated = 0;
  let errors = 0;
  let noVideos = 0;
  let cappedReached = false;

  for (const t of sortedTopics) {
    if (remaining() <= SAFETY_MS) {
      lines.push(`[budget] stopping — remaining=${Math.max(0, remaining())}ms`);
      break;
    }

    const missingLangs = ALL_LANGS.filter((lang) => !doneSet.has(`${t.id}|${lang}`));

    if (missingLangs.length === 0) {
      skippedTopics++;
      continue;
    }

    if (processedTopics >= MAX_TOPICS_PER_RUN) {
      cappedReached = true;
      lines.push(`[cap] stopping — processed=${processedTopics} max=${MAX_TOPICS_PER_RUN}`);
      break;
    }

    processedTopics++;

    for (const lang of missingLangs) {
      if (remaining() <= SAFETY_MS) break;

      try {
        console.log(`[cron-video-roundup] Generating: topic=${t.id} lang=${lang} date=${yesterday}`);
        const result = await generateVideoRoundup(t.id, yesterday, lang);
        switch (result.status) {
          case "ok":
            generated++;
            doneSet.add(`${t.id}|${lang}`);
            lines.push(`[ok] topic=${t.id} lang=${lang} slug=${result.slug} videos=${result.videoCount}`);
            break;
          case "no_videos":
            noVideos++;
            // Distinguish 0 vs below-threshold so the operator can tell
            // "no source material" from "MIN_VIDEOS not yet met" — both
            // legitimately produce no roundup but the second often
            // resolves itself once more channels post for the day.
            lines.push(
              result.videoCount === 0
                ? `[no_videos] topic=${t.id} lang=${lang} count=0`
                : `[insufficient_videos] topic=${t.id} lang=${lang} count=${result.videoCount} (need ≥2)`,
            );
            break;
          case "ai_invalid_json":
          case "ai_error":
          case "db_error":
          case "no_openai":
            errors++;
            lines.push(`[error] topic=${t.id} lang=${lang} status=${result.status} — ${result.errorMessage ?? ""}`);
            break;
        }
      } catch (e) {
        errors++;
        const msg = e instanceof Error ? e.message : "unknown";
        lines.push(`[error] topic=${t.id} lang=${lang} thrown — ${msg}`);
        console.log(`[cron-video-roundup] Error: topic=${t.id} lang=${lang} — ${msg}`);
      }
    }
  }

  const remainingTopics = sortedTopics.length - skippedTopics - processedTopics;
  const summary = `[run] cron=video-roundup date=${yesterday} topics=${sortedTopics.length} processed=${processedTopics} skipped=${skippedTopics} remaining=${remainingTopics} generated=${generated} no_videos=${noVideos} errors=${errors} capped=${cappedReached} elapsed_ms=${Date.now() - startedAt}`;
  lines.push(summary);
  console.log(lines.join("\n"));
  console.log(summary);
};
