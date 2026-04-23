import { createClient } from "@supabase/supabase-js";
import { generateVideoRoundup } from "./shared/generate-video-roundup";

/**
 * Nightly background function — generates yesterday's video roundup
 * for every (topic, lang) bucket that has at least 2 transcribed videos
 * and doesn't already have a roundup row.
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
 * Hard cap on the number of (topic × lang) buckets generated per run.
 * Each generation is a single OpenAI call (~10-30 s) so 5 × 2 = 10
 * calls fits comfortably under the 15-min wall.
 */
const MAX_TOPICS_PER_RUN = Number(process.env.VIDEO_ROUNDUP_MAX_TOPICS_PER_RUN ?? 5);

const ALL_LANGS = ["en", "fr"] as const;

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

  console.log(`[cron-video-roundup] Found ${topics.length} active topics, max ${MAX_TOPICS_PER_RUN} per run`);

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  // Bulk-load existing (topic, lang) roundups for yesterday so the loop
  // can fast-skip what a previous tick already wrote.
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
            lines.push(`[no_videos] topic=${t.id} lang=${lang} count=${result.videoCount}`);
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
