import { createClient } from "@supabase/supabase-js";
import { fetchAndStoreTopicDynamic } from "./shared/fetch-topic";

// Background functions have a 15-minute hard wall on Netlify.
// This cron is fetch-only: no AI scoring. Scoring is handled exclusively
// by cron-scoring-background.ts so each function stays specialized.
const CRON_WALL_MS = 840_000;
const CRON_BUDGET_MS = Number(process.env.CRON_BACKGROUND_FETCH_BUDGET_MS ?? 810_000);
const CRON_SAFETY_RESERVE_MS = Number(process.env.CRON_BACKGROUND_SAFETY_RESERVE_MS ?? 10_000);
// A topic is stale if it hasn't been fetched in this many ms.
// 5 min prevents re-fetching within the same run when topics are numerous.
const STALE_THRESHOLD_MS = Number(process.env.FETCH_STALE_THRESHOLD_MS ?? 5 * 60_000);

export default async () => {
  const startedAt = Date.now();
  const deadline = startedAt + Math.min(CRON_WALL_MS, CRON_BUDGET_MS);
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
  let deadlineStops = 0;

  // Multi-pass: each pass picks topics that went stale since the last fetch.
  // With no scoring overhead, a single pass over all topics is fast (~5–10 s/topic).
  // Subsequent passes catch up topics that arrived stale at run-start.
  while (budgetRemaining() > CRON_SAFETY_RESERVE_MS) {
    totalPasses += 1;
    const passStart = Date.now();

    // Re-read timestamps every pass so we see updates from the minute cron.
    const { data: freshTopics } = await supabase
      .from("topics")
      .select("id, last_fetched_at")
      .eq("is_active", true)
      .order("last_fetched_at", { ascending: true, nullsFirst: true });

    const now = Date.now();
    const staleQueue = (freshTopics ?? []).filter((t) => {
      if (!t.last_fetched_at) return true;
      return now - new Date(t.last_fetched_at).getTime() > STALE_THRESHOLD_MS;
    });

    if (staleQueue.length === 0) {
      lines.push(`[pass=${totalPasses}] all topics fresh — done`);
      break;
    }

    let passProcessed = 0;
    let passInserted = 0;

    for (const stale of staleQueue) {
      if (budgetRemaining() <= CRON_SAFETY_RESERVE_MS) {
        deadlineStops += 1;
        lines.push(`[pass=${totalPasses}] deadline stop — remaining=${Math.max(0, budgetRemaining())}ms`);
        break;
      }

      // Stamp before fetching so the minute cron doesn't race on the same topic.
      await supabase
        .from("topics")
        .update({ last_fetched_at: new Date().toISOString() })
        .eq("id", stale.id);

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
      `[pass=${totalPasses}] summary: stale=${staleQueue.length} processed=${passProcessed} inserted=${passInserted} elapsed=${Date.now() - passStart}ms`,
    );

    if (deadlineStops > 0) break;
  }

  lines.push(
    `[run] cron=fetch-background topics_total=${n} passes=${totalPasses} processed=${totalProcessed} inserted=${totalInserted} deadline_stops=${deadlineStops} elapsed_ms=${Date.now() - startedAt} budget_ms=${Math.min(CRON_WALL_MS, CRON_BUDGET_MS)}`,
  );
  console.log(lines.join("\n"));
};
