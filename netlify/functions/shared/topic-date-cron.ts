import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { previousUtcDay } from "../../../src/lib/dates-utc";

/**
 * Shared loop driver for the two « topic × date × lang » crons:
 *
 *  - `cron-video-roundup-background.ts`   → table `video_roundups`,    column `roundup_date`
 *  - `cron-daily-summary-background.ts`   → table `daily_summaries`,   column `summary_date`
 *
 * Both crons share ~80 % of the boilerplate (wall budget, Supabase client,
 * active-topics fetch, doneSet bulk-load, deterministic sort, double loop
 * topic × lang with cap + budget guards, structured `[run]` summary line).
 * Extracted here so a future cron of the same family stays a 30-line
 * config block instead of a 200-line copy of the loop.
 *
 * NOT used by `cron-video-transcribe-background.ts` — that cron drives a
 * different shape (24 h rolling window on `youtube_videos.published`,
 * dedup key on `video_id+lang` not `topic+lang`, extra `enrichDurations`
 * step, single-loop with `outer` label) so forcing it into the same
 * abstraction would over-generalize for marginal gain.
 *
 * Behaviour preserved exactly from the v2.5.9 inline code:
 *   - Wall budget = min(WALL_MS, BUDGET_MS), with `SAFETY_MS` headroom.
 *   - Date resolution: env-var override (YYYY-MM-DD) wins; otherwise
 *     `yesterdayUtc()` (UTC, see comments below).
 *   - Topics ordered by `id.localeCompare(b.id)` so consecutive ticks
 *     naturally pick up where the previous one stopped.
 *   - Outer cap is on « processed topics » (each topic = up to 2 langs).
 *   - Final log: `lines.join("\n")` then the standalone `[run]` summary
 *     so the operator can grep both the per-row events and the digest.
 */

const WALL_MS = 840_000;       // Netlify hard ceiling for background functions.
const DEFAULT_BUDGET_MS = 810_000;
const DEFAULT_SAFETY_MS = 15_000;
const ALL_LANGS = ["en", "fr"] as const;
type Lang = (typeof ALL_LANGS)[number];

/**
 * Compute « yesterday » in UTC. As of v2.5.9 the entire date pipeline is
 * UTC-aligned end-to-end so the cron is intended to be scheduled at
 * 00:00 UTC sharp on cron-job.org (= 02:00 CEST in summer / 01:00 CET
 * in winter — the configured wall-clock time on cron-job.org should
 * use timezone=UTC, not Europe/Paris, to keep the trigger point stable
 * across DST transitions).
 *
 * Why UTC. The libs this driver calls (`generateVideoRoundup`,
 * `generateDailySummary`) filter their data with UTC bounds derived
 * from the same date string passed here. Targeting "yesterday in UTC"
 * keeps the date key in lockstep with what the libs actually fetch.
 */
function resolveTargetDate(overrideEnv: string): { date: string; source: "override" | "yesterday-utc" } {
  const override = (process.env[overrideEnv] ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(override)) {
    return { date: override, source: "override" };
  }
  return { date: previousUtcDay(), source: "yesterday-utc" };
}

/**
 * Outcome of a single per-(topic, lang) work unit, as classified by the
 * caller's `handleResult`. The driver uses these three fields to:
 *   - increment the right counter for the final summary line (`counterKey`)
 *   - emit a structured log line in the per-row digest (`line`)
 *   - update the in-memory doneSet so the topic is correctly counted as
 *     « done » for the `[skipped]` math, even if a future tick re-runs
 *     the same `(topic, lang)` (defensive — we currently visit each
 *     bucket only once).
 */
export interface CronResult {
  counterKey: string;
  line: string;
  markDone: boolean;
}

export interface RunTopicDateLangCronOptions<R> {
  /** Used in every log line: `[cron-${cronName}]` + `cron=${cronName}` in summary. */
  cronName: string;
  /** Env var name (e.g. `ROUNDUP_DATE`, `DAILY_SUMMARY_DATE`) for date override. */
  dateOverrideEnv: string;
  /** Env var name for budget override; falls back to {@link DEFAULT_BUDGET_MS}. */
  budgetEnv?: string;
  /** Env var name for max-topics override; falls back to {@link defaultMaxTopics}. */
  maxTopicsEnv?: string;
  /** Default for `maxTopicsEnv` (typically 12). */
  defaultMaxTopics: number;
  /** Done-marker table (e.g. `video_roundups` or `daily_summaries`). */
  doneTable: string;
  /** Date column name on the done-marker table (e.g. `roundup_date`). */
  doneDateColumn: string;
  /** Per-(topic, lang) work function. Throws are caught and emitted as `thrown`. */
  generateOne: (topicId: string, date: string, lang: Lang) => Promise<R>;
  /** Maps the result of `generateOne` to a counter increment + log line. */
  handleResult: (result: R, ctx: { topicId: string; lang: Lang }) => CronResult;
  /** Counter keys that appear in the `[run]` summary line, in stable order. */
  summaryCounterKeys: readonly string[];
}

export async function runTopicDateLangCron<R>(opts: RunTopicDateLangCronOptions<R>): Promise<void> {
  const startedAt = Date.now();
  const budgetMs = Number(process.env[opts.budgetEnv ?? ""] ?? DEFAULT_BUDGET_MS);
  const maxTopicsPerRun = Number(process.env[opts.maxTopicsEnv ?? ""] ?? opts.defaultMaxTopics);
  const deadline = startedAt + Math.min(WALL_MS, budgetMs);
  const remaining = () => deadline - Date.now();
  const lines: string[] = [];

  console.log(`[cron-${opts.cronName}] Starting background function`);

  const supabase: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: topics, error: topicsErr } = await supabase
    .from("topics")
    .select("id")
    .eq("is_active", true);

  if (topicsErr) {
    console.log(`[cron-${opts.cronName}] DB error: ${topicsErr.message}`);
    return;
  }
  if (!topics || topics.length === 0) {
    console.log(`[cron-${opts.cronName}] No active topics`);
    return;
  }

  const { date: targetDate, source: dateSource } = resolveTargetDate(opts.dateOverrideEnv);
  const utcNow = new Date().toISOString();
  console.log(
    `[cron-${opts.cronName}] Found ${topics.length} active topics, max ${maxTopicsPerRun} per run, target_date=${targetDate} (source=${dateSource}, utc_now=${utcNow})`,
  );

  // Bulk-load existing (topic, lang) rows so the loop can fast-skip what
  // a previous tick already wrote — without an SQL round-trip per topic.
  // This is what makes the run resumable across multiple ticks.
  const { data: existingRows, error: existingErr } = await supabase
    .from(opts.doneTable)
    .select("topic_id, lang")
    .eq(opts.doneDateColumn, targetDate);

  if (existingErr) {
    console.log(`[cron-${opts.cronName}] DB error (existing): ${existingErr.message}`);
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

  // Counters surfaced in the final `[run]` line, plus the implicit
  // `thrown` slot for `catch` blocks (kept separate from `error` so an
  // operator can tell « lib reported error » from « code threw » at a
  // glance in the digest).
  const counters: Record<string, number> = { thrown: 0 };
  for (const k of opts.summaryCounterKeys) counters[k] = 0;

  let processedTopics = 0;
  let skippedTopics = 0;
  let cappedReached = false;

  for (const t of sortedTopics) {
    if (remaining() <= DEFAULT_SAFETY_MS) {
      lines.push(`[budget] stopping — remaining=${Math.max(0, remaining())}ms`);
      break;
    }

    const topicId = (t as { id: string }).id;
    const missingLangs = ALL_LANGS.filter((lang) => !doneSet.has(`${topicId}|${lang}`));

    if (missingLangs.length === 0) {
      skippedTopics++;
      continue;
    }

    if (processedTopics >= maxTopicsPerRun) {
      cappedReached = true;
      lines.push(`[cap] stopping — processed=${processedTopics} max=${maxTopicsPerRun}`);
      break;
    }

    processedTopics++;

    for (const lang of missingLangs) {
      if (remaining() <= DEFAULT_SAFETY_MS) break;

      try {
        console.log(`[cron-${opts.cronName}] Generating: topic=${topicId} lang=${lang} date=${targetDate}`);
        const result = await opts.generateOne(topicId, targetDate, lang);
        const handled = opts.handleResult(result, { topicId, lang });
        counters[handled.counterKey] = (counters[handled.counterKey] ?? 0) + 1;
        if (handled.markDone) doneSet.add(`${topicId}|${lang}`);
        lines.push(handled.line);
      } catch (e) {
        counters.thrown++;
        const msg = e instanceof Error ? e.message : "unknown";
        lines.push(`[error] topic=${topicId} lang=${lang} thrown — ${msg}`);
        console.log(`[cron-${opts.cronName}] Error: topic=${topicId} lang=${lang} — ${msg}`);
      }
    }
  }

  const remainingTopics = sortedTopics.length - skippedTopics - processedTopics;
  const counterParts = opts.summaryCounterKeys
    .map((k) => `${k}=${counters[k] ?? 0}`)
    .concat(counters.thrown > 0 ? [`thrown=${counters.thrown}`] : [])
    .join(" ");
  const summary = `[run] cron=${opts.cronName} date=${targetDate} topics=${sortedTopics.length} processed=${processedTopics} skipped=${skippedTopics} remaining=${remainingTopics} ${counterParts} capped=${cappedReached} elapsed_ms=${Date.now() - startedAt}`;
  lines.push(summary);
  console.log(lines.join("\n"));
  console.log(summary);
}
