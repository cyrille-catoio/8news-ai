import { createClient } from "@supabase/supabase-js";
import { fetchAndStoreTopicDynamic } from "./shared/fetch-topic";
import { scoreTopicForCron } from "./shared/score-topic";

const CRON_WALL_MS = 840_000;
const CRON_BUDGET_MS = Number(process.env.CRON_BUDGET_MS ?? 780_000);
const CRON_SAFETY_RESERVE_MS = Number(process.env.CRON_SAFETY_RESERVE_MS ?? 30_000);
const SCORE_CALL_RESERVE_MS = Number(process.env.FETCH_SCORE_CALL_RESERVE_MS ?? 60_000);
const FETCH_TOPICS_MAX_PER_RUN = Number(process.env.FETCH_TOPICS_MAX_PER_RUN ?? 3);
const FETCH_MINI_SCORE_MAX = Number(process.env.FETCH_MINI_SCORE_MAX ?? 50);
const FETCH_MINI_SCORE_MIN = Number(process.env.FETCH_MINI_SCORE_MIN ?? 15);

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
    return new Response(`DB error: ${error.message}`, { status: 500 });
  }

  const n = allTopics?.length ?? 0;
  if (n === 0) return new Response("No active topics");

  const k = Math.min(Math.max(1, Math.ceil(n / 10)), FETCH_TOPICS_MAX_PER_RUN);
  const batch = (allTopics as TopicFetchRow[]).slice(0, k);
  let processedTopics = 0;
  let totalInserted = 0;
  let totalMiniScored = 0;
  let deadlineStops = 0;

  for (const topic of batch) {
    if (budgetRemaining() <= CRON_SAFETY_RESERVE_MS) {
      deadlineStops += 1;
      lines.push("[deadline] fetch loop stopped before next topic");
      break;
    }

    await supabase
      .from("topics")
      .update({ last_fetched_at: new Date().toISOString() })
      .eq("id", topic.id);

    const fetchStart = Date.now();
    const { summary, inserted, feedsOk, feedsFailed, totalParsed } =
      await fetchAndStoreTopicDynamic(topic.id, supabase);
    const fetchElapsed = Date.now() - fetchStart;
    processedTopics += 1;
    totalInserted += inserted;
    lines.push(summary);
    lines.push(
      `[metric] topic=${topic.id} phase=fetch elapsed_ms=${fetchElapsed} feeds_ok=${feedsOk} feeds_failed=${feedsFailed} parsed=${totalParsed} inserted=${inserted} remaining_ms=${Math.max(0, budgetRemaining())}`,
    );

    if (inserted > 0 && budgetRemaining() > SCORE_CALL_RESERVE_MS + CRON_SAFETY_RESERVE_MS) {
      const remaining = budgetRemaining();
      const capacityFactor = clamp((remaining - SCORE_CALL_RESERVE_MS) / 60_000, 0.5, 1.6);
      const adaptiveTarget = Math.round(inserted * capacityFactor);
      const miniScoreMax = clamp(adaptiveTarget, FETCH_MINI_SCORE_MIN, FETCH_MINI_SCORE_MAX);
      const criteria = {
        scoring_domain: topic.scoring_domain,
        scoring_tier1: topic.scoring_tier1,
        scoring_tier2: topic.scoring_tier2,
        scoring_tier3: topic.scoring_tier3,
        scoring_tier4: topic.scoring_tier4,
        scoring_tier5: topic.scoring_tier5,
      };
      const scoreResult = await scoreTopicForCron(topic.id, criteria, supabase, {
        maxArticles: miniScoreMax,
        maxArticlesCap: FETCH_MINI_SCORE_MAX,
        windowHours: null,
        maxElapsedMs: Math.max(
          5_000,
          Math.min(120_000, budgetRemaining() - CRON_SAFETY_RESERVE_MS),
        ),
      });
      totalMiniScored += scoreResult.scored;
      lines.push(
        `post-fetch: ${scoreResult.message} (partial=${scoreResult.partial ? "1" : "0"}, elapsed_ms=${scoreResult.elapsedMs}, errors=${scoreResult.errors.length})`,
      );
    } else if (inserted > 0) {
      lines.push(
        `[skip] topic=${topic.id} phase=post-fetch-score reason=low_remaining_budget remaining_ms=${Math.max(0, budgetRemaining())}`,
      );
    }
  }

  const output = [
    ...lines,
    `[run] cron=fetch-background topics_total=${n} topics_target=${batch.length} topics_processed=${processedTopics} inserted=${totalInserted} mini_scored=${totalMiniScored} deadline_stops=${deadlineStops} elapsed_ms=${Date.now() - startedAt} budget_ms=${Math.min(CRON_WALL_MS, CRON_BUDGET_MS)}`,
  ].join("\n");
  console.log(output);
};
