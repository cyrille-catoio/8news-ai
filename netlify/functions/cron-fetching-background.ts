import { createClient } from "@supabase/supabase-js";
import { fetchAndStoreTopicDynamic } from "./shared/fetch-topic";

// Background functions have a 15-minute hard wall on Netlify.
// This cron is fetch-only: no AI scoring. Scoring is handled exclusively
// by cron-scoring-background.ts so each function stays specialized.
const CRON_TIMEOUT_MS = Number(process.env.CRON_BACKGROUND_FETCH_TIMEOUT_MS ?? 15 * 60_000);
const CRON_BUDGET_MS = Number(process.env.CRON_BACKGROUND_FETCH_BUDGET_MS ?? 14.5 * 60_000);
const CRON_INTERVAL_MS = Number(process.env.CRON_BACKGROUND_FETCH_INTERVAL_MS ?? 15 * 60_000);
const CRON_SAFETY_RESERVE_MS = Number(process.env.CRON_BACKGROUND_FETCH_SAFETY_RESERVE_MS ?? 15_000);
const FETCH_TOPIC_START_MIN_REMAINING_MS = Number(
  process.env.FETCH_TOPIC_START_MIN_REMAINING_MS ?? 45_000,
);
// Default to one pass for a 15-minute external cadence. The previous
// multi-pass default was useful for a shorter trigger, but with
// background functions allowed to overlap it could refetch a topic inside
// the same invocation. Set FETCH_MAX_PASSES=0 to restore "until budget"
// behavior for a catch-up run.
const FETCH_MAX_PASSES = Number(process.env.FETCH_MAX_PASSES ?? 1);
// A topic is stale if it hasn't been claimed/fetched in this many ms.
// Keep the default below the 15-minute scheduler interval: topics claimed
// a few minutes into the previous run are still eligible on the next tick,
// while the conditional claim below prevents concurrent duplicate work.
const DEFAULT_STALE_THRESHOLD_MS = Math.min(CRON_INTERVAL_MS, 10 * 60_000);
const STALE_THRESHOLD_MS = Number(process.env.FETCH_STALE_THRESHOLD_MS ?? DEFAULT_STALE_THRESHOLD_MS);

function isStale(lastFetchedAt: string | null, nowMs: number): boolean {
  if (!lastFetchedAt) return true;
  return nowMs - new Date(lastFetchedAt).getTime() > STALE_THRESHOLD_MS;
}

export default async () => {
  const startedAt = Date.now();
  const effectiveBudgetMs = Math.min(CRON_TIMEOUT_MS, CRON_BUDGET_MS);
  const deadline = startedAt + effectiveBudgetMs;
  const budgetRemaining = () => deadline - Date.now();
  const lines: string[] = [];

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Initial count for summary log only — no scoring fields needed.
  const { data: allTopics, error } = await supabase
    .from("topics")
    .select("id")
    .eq("is_active", true);

  if (error) {
    console.error(`[cron-fetching-background] DB error: ${error.message}`);
    return;
  }

  const n = allTopics?.length ?? 0;
  if (n === 0) {
    console.log("[cron-fetching-background] No active topics");
    return;
  }

  let totalPasses = 0;
  let totalProcessed = 0;
  let totalInserted = 0;
  let totalClaimSkipped = 0;
  let deadlineStops = 0;
  const maxPasses = FETCH_MAX_PASSES <= 0 ? Number.POSITIVE_INFINITY : FETCH_MAX_PASSES;

  // Each pass picks topics that went stale since the last fetch. With a
  // 15-minute external trigger the default is a single pass; concurrent
  // background invocations coordinate through the conditional claim below.
  while (totalPasses < maxPasses && budgetRemaining() > CRON_SAFETY_RESERVE_MS) {
    totalPasses += 1;
    const passStart = Date.now();

    // Re-read timestamps every pass so we see claims from concurrent runs.
    const { data: freshTopics } = await supabase
      .from("topics")
      .select("id, last_fetched_at")
      .eq("is_active", true)
      .order("last_fetched_at", { ascending: true, nullsFirst: true });

    const now = Date.now();
    const staleQueue = (freshTopics ?? []).filter((t) => isStale(t.last_fetched_at, now));

    if (staleQueue.length === 0) {
      lines.push(`[pass=${totalPasses}] all topics fresh — done`);
      break;
    }

    let passProcessed = 0;
    let passInserted = 0;
    let passClaimSkipped = 0;

    for (const stale of staleQueue) {
      if (budgetRemaining() <= Math.max(CRON_SAFETY_RESERVE_MS, FETCH_TOPIC_START_MIN_REMAINING_MS)) {
        deadlineStops += 1;
        lines.push(`[pass=${totalPasses}] deadline stop — remaining=${Math.max(0, budgetRemaining())}ms`);
        break;
      }

      // Stamp before fetching so overlapping background invocations don't
      // race on the same topic. The staleness predicate is repeated in the
      // UPDATE, so a topic claimed by another run after our SELECT is skipped.
      const claimNow = new Date();
      const claimCutoff = new Date(claimNow.getTime() - STALE_THRESHOLD_MS).toISOString();
      const { data: claimed, error: claimError } = await supabase
        .from("topics")
        .update({ last_fetched_at: claimNow.toISOString() })
        .eq("id", stale.id)
        .or(`last_fetched_at.is.null,last_fetched_at.lt.${claimCutoff}`)
        .select("id");

      if (claimError) {
        lines.push(`[pass=${totalPasses}] topic=${stale.id} claim_error=${claimError.message}`);
        continue;
      }
      if ((claimed?.length ?? 0) === 0) {
        passClaimSkipped += 1;
        totalClaimSkipped += 1;
        continue;
      }

      const fetchStart = Date.now();
      const { summary, inserted, feedsOk, feedsFailed, totalParsed } =
        await fetchAndStoreTopicDynamic(stale.id, supabase);
      const fetchElapsed = Date.now() - fetchStart;

      passProcessed += 1;
      totalProcessed += 1;
      passInserted += inserted;
      totalInserted += inserted;
      lines.push(summary);
      lines.push(
        `[pass=${totalPasses}] topic=${stale.id} elapsed=${fetchElapsed}ms feeds_ok=${feedsOk} failed=${feedsFailed} parsed=${totalParsed} inserted=${inserted} remaining=${Math.max(0, budgetRemaining())}ms`,
      );
    }

    lines.push(
      `[pass=${totalPasses}] summary: stale=${staleQueue.length} processed=${passProcessed} claim_skipped=${passClaimSkipped} inserted=${passInserted} elapsed=${Date.now() - passStart}ms`,
    );

    if (deadlineStops > 0) break;
  }

  lines.push(
    `[run] cron=fetch-background topics_total=${n} passes=${totalPasses} processed=${totalProcessed} claim_skipped=${totalClaimSkipped} inserted=${totalInserted} deadline_stops=${deadlineStops} elapsed_ms=${Date.now() - startedAt} budget_ms=${effectiveBudgetMs} interval_ms=${CRON_INTERVAL_MS} stale_ms=${STALE_THRESHOLD_MS}`,
  );
  console.log(lines.join("\n"));
};
