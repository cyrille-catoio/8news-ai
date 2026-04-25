import { createClient } from "@supabase/supabase-js";
import { generateDailySummary } from "./shared/generate-daily-summary";

const WALL_MS = 840_000;
const BUDGET_MS = Number(process.env.DAILY_SUMMARY_BUDGET_MS ?? 810_000);
const SAFETY_MS = 15_000;

/**
 * Hard cap on the number of topics processed per cron tick.
 *
 * The Netlify background-function wall is 15 min and a single OpenAI call can
 * push 30–60 s. Capping the work per run avoids timeouts on days where many
 * topics need a fresh summary (e.g. cold start). The cron is expected to run
 * multiple times per day; each run picks up where the previous left off
 * because already-generated `(topic, lang)` rows are fast-skipped via a
 * single bulk SELECT below.
 */
const MAX_TOPICS_PER_RUN = Number(process.env.DAILY_SUMMARY_MAX_TOPICS_PER_RUN ?? 12);

const ALL_LANGS = ["en", "fr"] as const;

/**
 * Compute "yesterday" in UTC. As of v2.5.9 the entire date pipeline is
 * UTC-aligned end-to-end — the cron is intended to be scheduled at
 * 00:00 UTC sharp on cron-job.org (= 02:00 CEST in summer / 01:00 CET
 * in winter). Configure the cron-job.org timezone to UTC, not
 * Europe/Paris, so the trigger point stays stable across DST.
 *
 * Why UTC. `generateDailySummary` queries `articles.fetched_at`
 * (TIMESTAMPTZ) with explicit ISO bounds `${date}T00:00:00Z` /
 * `${date}T23:59:59.999Z`. Targeting "yesterday in UTC" keeps the
 * date key produced here in lockstep with the bounds the lib uses,
 * so a cron firing at 00:00 UTC summarizes the calendar day that
 * just ended in UTC.
 *
 * The optional `DAILY_SUMMARY_DATE` env var override is honored first
 * so the cron can be re-pointed to backfill a specific historical date
 * (YYYY-MM-DD) without a redeploy.
 */
function yesterdayUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function resolveTargetDate(): { date: string; source: "override" | "yesterday-utc" } {
  const override = (process.env.DAILY_SUMMARY_DATE ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(override)) {
    return { date: override, source: "override" };
  }
  return { date: yesterdayUtc(), source: "yesterday-utc" };
}

export default async () => {
  const startedAt = Date.now();
  const deadline = startedAt + Math.min(WALL_MS, BUDGET_MS);
  const remaining = () => deadline - Date.now();
  const lines: string[] = [];

  console.log("[cron-daily-summary] Starting background function");

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
    console.log(`[cron-daily-summary] DB error: ${topicsErr.message}`);
    return;
  }

  if (!topics || topics.length === 0) {
    console.log("[cron-daily-summary] No active topics");
    return;
  }

  const { date: yesterday, source: dateSource } = resolveTargetDate();
  const utcNow = new Date().toISOString();
  console.log(
    `[cron-daily-summary] Found ${topics.length} active topics, max ${MAX_TOPICS_PER_RUN} per run, target_date=${yesterday} (source=${dateSource}, utc_now=${utcNow})`,
  );

  // Bulk-load existing (topic, lang) summaries so the loop can fast-skip
  // anything a previous cron tick already wrote — without an SQL round-trip
  // per topic. This is what makes the run resumable across multiple ticks.
  const { data: existingRows, error: existingErr } = await supabase
    .from("daily_summaries")
    .select("topic_id, lang")
    .eq("summary_date", yesterday);

  if (existingErr) {
    console.log(`[cron-daily-summary] DB error (existing): ${existingErr.message}`);
    return;
  }

  const doneSet = new Set<string>();
  for (const r of existingRows ?? []) {
    const row = r as { topic_id: string; lang: string };
    doneSet.add(`${row.topic_id}|${row.lang}`);
  }

  // Deterministic ordering so consecutive cron ticks naturally pick up
  // where the previous one stopped (already-done topics get fast-skipped
  // before they consume any of the per-run cap).
  const sortedTopics = [...topics].sort((a, b) =>
    String((a as { id: string }).id).localeCompare(String((b as { id: string }).id)),
  );

  let processedTopics = 0;
  let skippedTopics = 0;
  let generated = 0;
  let errors = 0;
  let noArticles = 0;
  let cappedReached = false;

  for (const t of sortedTopics) {
    if (remaining() <= SAFETY_MS) {
      lines.push(`[budget] stopping — remaining=${Math.max(0, remaining())}ms`);
      break;
    }

    const missingLangs = ALL_LANGS.filter((lang) => !doneSet.has(`${t.id}|${lang}`));

    if (missingLangs.length === 0) {
      // Both langs already exist for this topic → nothing to do.
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
        console.log(`[cron-daily-summary] Generating: topic=${t.id} lang=${lang} date=${yesterday}`);
        const result = await generateDailySummary(t.id, yesterday, lang);
        if (result) {
          if (result.status === "no_articles") {
            noArticles++;
            lines.push(`[no_articles] topic=${t.id} lang=${lang}`);
          } else {
            generated++;
            // Mark as done so a subsequent topic re-check inside the same
            // run wouldn't double-count (defensive — currently we only
            // visit each (topic, lang) once).
            doneSet.add(`${t.id}|${lang}`);
            lines.push(`[ok] topic=${t.id} lang=${lang} slug=${result.slug} bullets=${result.bulletCount} articles=${result.articleCount}`);
          }
        } else {
          lines.push(`[skip] topic=${t.id} lang=${lang} — generation returned null`);
        }
      } catch (e) {
        errors++;
        const msg = e instanceof Error ? e.message : "unknown";
        lines.push(`[error] topic=${t.id} lang=${lang} — ${msg}`);
        console.log(`[cron-daily-summary] Error: topic=${t.id} lang=${lang} — ${msg}`);
      }
    }
  }

  const remainingTopics = sortedTopics.length - skippedTopics - processedTopics;
  const summary = `[run] cron=daily-summary date=${yesterday} topics=${sortedTopics.length} processed=${processedTopics} skipped=${skippedTopics} remaining=${remainingTopics} generated=${generated} no_articles=${noArticles} errors=${errors} capped=${cappedReached} elapsed_ms=${Date.now() - startedAt}`;
  lines.push(summary);
  console.log(lines.join("\n"));
  console.log(summary);
};
