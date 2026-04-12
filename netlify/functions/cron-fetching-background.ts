import { createClient } from "@supabase/supabase-js";
import { fetchAndStoreTopicDynamic } from "./shared/fetch-topic";
import { scoreTopicForCron } from "./shared/score-topic";

const CRON_WALL_MS = 840_000;
const CRON_BUDGET_MS = Number(process.env.CRON_BUDGET_MS ?? 780_000);
const CRON_SAFETY_RESERVE_MS = Number(process.env.CRON_SAFETY_RESERVE_MS ?? 30_000);
const SCORE_CALL_RESERVE_MS = Number(process.env.FETCH_SCORE_CALL_RESERVE_MS ?? 120_000);
const FETCH_MINI_SCORE_MAX = Number(process.env.FETCH_MINI_SCORE_MAX ?? 80);
const FETCH_MINI_SCORE_MIN = Number(process.env.FETCH_MINI_SCORE_MIN ?? 15);
const STALE_THRESHOLD_MS = 2 * 60_000;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

type TopicFetchRow = {
  id: string;
  last_fetched_at: string | null;
  scoring_domain: string;
  scoring_tier1: string;
  scoring_tier2: string;
  scoring_tier3: string;
  scoring_tier4: string;
  scoring_tier5: string;
};

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

  const { data: allTopics, error } = await supabase
    .from("topics")
    .select(
      "id, last_fetched_at, scoring_domain, scoring_tier1, scoring_tier2, scoring_tier3, scoring_tier4, scoring_tier5",
    )
    .eq("is_active", true)
    .order("last_fetched_at", { ascending: true, nullsFirst: true });

  if (error) {
    console.error(`[cron-fetching-background] DB error: ${error.message}`);
    return;
  }

  const n = allTopics?.length ?? 0;
  if (n === 0) {
    console.log("[cron-fetching-background] No active topics");
    return;
  }

  const topicMap = new Map<string, TopicFetchRow>();
  for (const t of allTopics as TopicFetchRow[]) topicMap.set(t.id, t);

  let totalPasses = 0;
  let totalProcessed = 0;
  let totalInserted = 0;
  let totalMiniScored = 0;
  let deadlineStops = 0;

  // ── Multi-pass: re-fetch stale topics until all are fresh or budget exhausted
  while (budgetRemaining() > CRON_SAFETY_RESERVE_MS) {
    totalPasses += 1;
    const passStart = Date.now();

    // Re-read last_fetched_at to find topics that are stale
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
    let passMiniScored = 0;

    for (const stale of staleQueue) {
      if (budgetRemaining() <= CRON_SAFETY_RESERVE_MS) {
        deadlineStops += 1;
        lines.push(`[pass=${totalPasses}] deadline stop — low remaining budget`);
        break;
      }

      const topic = topicMap.get(stale.id);
      if (!topic) continue;

      await supabase
        .from("topics")
        .update({ last_fetched_at: new Date().toISOString() })
        .eq("id", topic.id);

      const fetchStart = Date.now();
      const { summary, inserted, feedsOk, feedsFailed, totalParsed } =
        await fetchAndStoreTopicDynamic(topic.id, supabase);
      const fetchElapsed = Date.now() - fetchStart;
      passProcessed += 1;
      totalProcessed += 1;
      passInserted += inserted;
      totalInserted += inserted;
      lines.push(summary);
      lines.push(
        `[pass=${totalPasses}] topic=${topic.id} phase=fetch elapsed=${fetchElapsed}ms feeds_ok=${feedsOk} feeds_failed=${feedsFailed} parsed=${totalParsed} inserted=${inserted} remaining=${Math.max(0, budgetRemaining())}ms`,
      );

      // ── Post-fetch mini-scoring: score up to FETCH_MINI_SCORE_MAX unscored articles
      if (budgetRemaining() > SCORE_CALL_RESERVE_MS + CRON_SAFETY_RESERVE_MS) {
        const { count: unscoredCount } = await supabase
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("topic", topic.id)
          .is("relevance_score", null);

        const backlog = unscoredCount ?? 0;
        if (backlog > 0) {
          const topicsLeft = staleQueue.length - passProcessed;
          const scoreBudget = Math.max(
            10_000,
            Math.min(
              180_000,
              Math.floor((budgetRemaining() - CRON_SAFETY_RESERVE_MS) / Math.max(1, topicsLeft + 1)),
            ),
          );
          const maxArticles = clamp(backlog, FETCH_MINI_SCORE_MIN, FETCH_MINI_SCORE_MAX);
          const criteria = {
            scoring_domain: topic.scoring_domain,
            scoring_tier1: topic.scoring_tier1,
            scoring_tier2: topic.scoring_tier2,
            scoring_tier3: topic.scoring_tier3,
            scoring_tier4: topic.scoring_tier4,
            scoring_tier5: topic.scoring_tier5,
          };
          const scoreResult = await scoreTopicForCron(topic.id, criteria, supabase, {
            maxArticles,
            maxArticlesCap: FETCH_MINI_SCORE_MAX,
            windowHours: null,
            maxElapsedMs: scoreBudget,
          });
          passMiniScored += scoreResult.scored;
          totalMiniScored += scoreResult.scored;
          lines.push(
            `[pass=${totalPasses}] topic=${topic.id} phase=mini-score backlog=${backlog} scored=${scoreResult.scored}/${scoreResult.candidateCount} partial=${scoreResult.partial ? "1" : "0"} elapsed=${scoreResult.elapsedMs}ms errors=${scoreResult.errors.length}`,
          );
        }
      }
    }

    lines.push(
      `[pass=${totalPasses}] summary: stale_topics=${staleQueue.length} processed=${passProcessed} inserted=${passInserted} mini_scored=${passMiniScored} elapsed=${Date.now() - passStart}ms`,
    );

    if (deadlineStops > 0) break;
  }

  lines.push(
    `[run] cron=fetch-background topics_total=${n} passes=${totalPasses} processed=${totalProcessed} inserted=${totalInserted} mini_scored=${totalMiniScored} deadline_stops=${deadlineStops} elapsed_ms=${Date.now() - startedAt} budget_ms=${Math.min(CRON_WALL_MS, CRON_BUDGET_MS)}`,
  );
  console.log(lines.join("\n"));
};
