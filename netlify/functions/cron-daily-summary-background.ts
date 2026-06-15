import { generateDailySummary } from "./shared/generate-daily-summary";
import { runTopicDateLangCron } from "./shared/topic-date-cron";
import { checkCronSecret } from "./shared/cron-auth";

/**
 * Nightly background function — generates yesterday's daily summary
 * for every (topic, lang) bucket that has scored articles for the
 * target date and doesn't already have a summary row.
 *
 * Loop driver lives in `./shared/topic-date-cron.ts` — shared with
 * `cron-video-roundup-background.ts` (same shape: topic × date × lang
 * fan-out with bulk-loaded done set, deterministic ordering, per-run
 * cap, budget guard, structured `[run]` summary line). This file is
 * the cron-specific config: how to generate one daily summary, how
 * to map its result to a counter + log line.
 *
 * Triggered externally via cron-job.org (configure it in UTC tz with
 * schedule `0 0 * * *` so the tick fires right after the UTC day
 * boundary the new code targets — see v2.5.9 changelog).
 */

export default async (req: Request) => {
  const cronAuth = checkCronSecret(req);
  if (cronAuth.warning) console.warn(`[cron-daily-summary] ${cronAuth.warning}`);
  if (!cronAuth.ok) return;
  return runTopicDateLangCron({
    cronName: "daily-summary",
    dateOverrideEnv: "DAILY_SUMMARY_DATE",
    budgetEnv: "DAILY_SUMMARY_BUDGET_MS",
    maxTopicsEnv: "DAILY_SUMMARY_MAX_TOPICS_PER_RUN",
    /**
     * Hard cap on the number of topics processed per cron tick. The
     * Netlify background-function wall is 15 min and a single OpenAI
     * call can push 30–60 s. Capping the work per run avoids timeouts
     * on days where many topics need a fresh summary (e.g. cold start).
     * The cron is expected to run multiple times per day; each run
     * picks up where the previous left off because already-generated
     * `(topic, lang)` rows are fast-skipped via the bulk SELECT in
     * the shared driver.
     */
    defaultMaxTopics: 12,
    doneTable: "daily_summaries",
    doneDateColumn: "summary_date",
    generateOne: (topicId, date, lang) => generateDailySummary(topicId, date, lang),
    handleResult: (result, { topicId, lang }) => {
      // Generation can return null when prerequisites are missing
      // (no OPENAI_API_KEY, no topic prompt, AI parse failure on both
      // attempts). Surface as `[skip]` rather than `[error]` since
      // it's a pre-flight gate, not a runtime failure.
      if (!result) {
        return {
          counterKey: "skipped",
          line: `[skip] topic=${topicId} lang=${lang} — generation returned null`,
          markDone: false,
        };
      }
      if (result.status === "no_articles") {
        return {
          counterKey: "no_articles",
          line: `[no_articles] topic=${topicId} lang=${lang}`,
          markDone: false,
        };
      }
      // Both `generated` and `skipped` (existing row reused) succeeded
      // from the cron's POV. We mark them as done so the same tick
      // wouldn't double-visit the bucket if the loop ever re-enters.
      return {
        counterKey: "generated",
        line: `[ok] topic=${topicId} lang=${lang} slug=${result.slug} bullets=${result.bulletCount} articles=${result.articleCount}`,
        markDone: true,
      };
    },
    summaryCounterKeys: ["generated", "no_articles", "skipped"] as const,
  });
};
