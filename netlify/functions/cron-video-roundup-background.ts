import { generateVideoRoundup } from "./shared/generate-video-roundup";
import { runTopicDateLangCron } from "./shared/topic-date-cron";
import { requireCronSecret } from "./shared/cron-auth";

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
 * Loop driver lives in `./shared/topic-date-cron.ts` — shared with
 * `cron-daily-summary-background.ts` (same shape: topic × date × lang
 * fan-out with bulk-loaded done set, deterministic ordering, per-run
 * cap, budget guard, structured `[run]` summary line). This file is
 * the cron-specific config: how to generate one roundup, how to map
 * its result to a counter + log line.
 *
 * Triggered externally via cron-job.org (no Netlify schedule declared
 * here — the project moved schedule management out of netlify.toml in
 * v1.88, see SPEC).
 */

export default async (req: Request) => {
  if (!requireCronSecret(req, "cron-video-roundup")) return;

  return runTopicDateLangCron({
    cronName: "video-roundup",
    dateOverrideEnv: "ROUNDUP_DATE",
    budgetEnv: "VIDEO_ROUNDUP_BUDGET_MS",
    maxTopicsEnv: "VIDEO_ROUNDUP_MAX_TOPICS_PER_RUN",
    /**
     * Hard cap on the number of topics processed per run (each topic
     * generates up to 2 buckets — one per lang). With ~10-30 s per
     * OpenAI call, 12 topics × 2 langs = 24 calls comfortably fits in
     * the 14-min effective wall (BUDGET_MS - SAFETY_MS). Bumped from
     * the original 5 once the catalog grew past 30 topics: at 5/run
     * it took 8 ticks to drain a single date, which never finished
     * if the cron only fired 1-2 times a night.
     */
    defaultMaxTopics: 12,
    doneTable: "video_roundups",
    doneDateColumn: "roundup_date",
    generateOne: (topicId, date, lang) => generateVideoRoundup(topicId, date, lang),
    handleResult: (result, { topicId, lang }) => {
      switch (result.status) {
        case "ok":
          return {
            counterKey: "generated",
            line: `[ok] topic=${topicId} lang=${lang} slug=${result.slug} videos=${result.videoCount}`,
            markDone: true,
          };
        case "no_videos":
          // Distinguish 0 vs below-threshold so the operator can tell
          // « no source material » from « MIN_VIDEOS not yet met » —
          // both legitimately produce no roundup but the second often
          // resolves itself once more channels post for the day.
          return {
            counterKey: "no_videos",
            line:
              result.videoCount === 0
                ? `[no_videos] topic=${topicId} lang=${lang} count=0`
                : `[insufficient_videos] topic=${topicId} lang=${lang} count=${result.videoCount} (need ≥2)`,
            markDone: false,
          };
        default:
          return {
            counterKey: "errors",
            line: `[error] topic=${topicId} lang=${lang} status=${result.status} — ${result.errorMessage ?? ""}`,
            markDone: false,
          };
      }
    },
    summaryCounterKeys: ["generated", "no_videos", "errors"] as const,
  });
};
