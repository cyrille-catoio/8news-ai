import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { scoreTopicForCron } from "./shared/score-topic";
import { startCronRun } from "./shared/cron-log";

// Background functions have a 15-minute hard timeout on Netlify and the
// scoring cron is triggered every 15 minutes. Keep the default budget below
// both limits so one tick has time to finish before the next one starts.
// This cron is score-only: no RSS fetching. Fetching is handled exclusively
// by cron-fetching-background.ts so each function stays specialized.
const CRON_INTERVAL_MS = Number(process.env.CRON_BACKGROUND_SCORE_INTERVAL_MS ?? 900_000);
const CRON_TIMEOUT_MS = Number(process.env.CRON_BACKGROUND_SCORE_TIMEOUT_MS ?? 900_000);
const CRON_OVERLAP_RESERVE_MS = Number(process.env.CRON_BACKGROUND_SCORE_OVERLAP_RESERVE_MS ?? 60_000);
const DEFAULT_CRON_BUDGET_MS = Math.max(
  60_000,
  Math.min(CRON_INTERVAL_MS, CRON_TIMEOUT_MS) - CRON_OVERLAP_RESERVE_MS,
);
const CRON_BUDGET_MS = Number(process.env.CRON_BACKGROUND_SCORE_BUDGET_MS ?? DEFAULT_CRON_BUDGET_MS);
const CRON_SAFETY_RESERVE_MS = Number(
  process.env.CRON_BACKGROUND_SCORE_SAFETY_RESERVE_MS
    ?? process.env.CRON_BACKGROUND_SAFETY_RESERVE_MS
    ?? 30_000,
);
// 15-minute cadence: keep each topic pass bounded so a slow OpenAI period
// degrades throughput instead of consuming the whole cron on timed-out batches.
const SCORE_MAX_ARTICLES_PER_RUN = Number(process.env.SCORE_MAX_ARTICLES_PER_RUN ?? 80);
const SCORE_MIN_ARTICLES_PER_RUN = Number(process.env.SCORE_MIN_ARTICLES_PER_RUN ?? 10);
const SCORE_HARD_ARTICLE_CAP = Number(process.env.SCORE_HARD_ARTICLE_CAP ?? 120);

type TopicScoreRow = {
  id: string;
  last_scored_at: string | null;
  scoring_domain: string;
  scoring_tier1: string;
  scoring_tier2: string;
  scoring_tier3: string;
  scoring_tier4: string;
  scoring_tier5: string;
};

type TopicWork = {
  topic: TopicScoreRow;
  backlog: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// Picks how many articles to score for one topic in one pass.
// Scales with backlog, but avoids huge batches that are prone to OpenAI timeouts.
function pickAdaptiveMaxArticles(remainingMs: number, backlog: number): number {
  const pressureBoost = backlog >= 400 ? 40 : backlog >= 200 ? 25 : backlog >= 75 ? 10 : 0;
  const timeCap =
    remainingMs > 600_000 ? 120 :
    remainingMs > 300_000 ? 100 :
    remainingMs > 120_000 ? 80 :
    remainingMs > 60_000  ? 50 :
    25;
  return clamp(
    SCORE_MAX_ARTICLES_PER_RUN + pressureBoost,
    SCORE_MIN_ARTICLES_PER_RUN,
    Math.min(timeCap, SCORE_HARD_ARTICLE_CAP),
  );
}

// Fetches unscored article counts for all topics in parallel (one DB query each).
async function getBacklogCounts(
  supabase: SupabaseClient,
  topicIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  await Promise.all(
    topicIds.map(async (id) => {
      const { count } = await supabase
        .from("articles")
        .select("id", { count: "exact", head: true })
        .eq("topic", id)
        .is("relevance_score", null);
      counts.set(id, count ?? 0);
    }),
  );
  return counts;
}

export default async () => {
  const effectiveBudgetMs = Math.min(CRON_INTERVAL_MS, CRON_TIMEOUT_MS, CRON_BUDGET_MS);
  const { elapsedMs, remaining: budgetRemaining } = startCronRun(
    "cron-scoring-background",
    effectiveBudgetMs,
  );

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // last_scored_at drives starvation-prevention sort (never-scored topics first).
  const { data: topics, error } = await supabase
    .from("topics")
    .select(
      "id, last_scored_at, scoring_domain, scoring_tier1, scoring_tier2, scoring_tier3, scoring_tier4, scoring_tier5",
    )
    .eq("is_active", true);

  if (error) {
    console.error(`[cron-scoring-background] DB error: ${error.message}`);
    return;
  }

  if (!topics || topics.length === 0) {
    console.log("[cron-scoring-background] No active topics");
    return;
  }

  const rows = topics as TopicScoreRow[];
  const lines: string[] = [];
  let totalScored = 0;
  let totalPasses = 0;
  let deadlineStops = 0;

  // Multi-pass: each pass drains as much backlog as possible within budget.
  // Exits early when all backlogs are 0 or budget is exhausted.
  while (budgetRemaining() > CRON_SAFETY_RESERVE_MS) {
    totalPasses += 1;
    const passStart = Date.now();

    const backlogMap = await getBacklogCounts(supabase, rows.map((r) => r.id));
    const queue: TopicWork[] = rows
      .filter((r) => (backlogMap.get(r.id) ?? 0) > 0)
      .map((r) => ({ topic: r, backlog: backlogMap.get(r.id)! }))
      .sort((a, b) => {
        // Primary: most unscored articles first (highest urgency).
        if (b.backlog !== a.backlog) return b.backlog - a.backlog;
        // Secondary: never-scored topics first, then oldest-scored.
        // Treats null last_scored_at as epoch 0 → highest priority.
        const aTime = a.topic.last_scored_at ? new Date(a.topic.last_scored_at).getTime() : 0;
        const bTime = b.topic.last_scored_at ? new Date(b.topic.last_scored_at).getTime() : 0;
        return aTime - bTime;
      });

    if (queue.length === 0) {
      lines.push(`[pass=${totalPasses}] all backlogs empty — done`);
      break;
    }

    const totalBacklogThisPass = queue.reduce((s, w) => s + w.backlog, 0);
    let passScored = 0;
    let passTopics = 0;

    for (const work of queue) {
      if (budgetRemaining() <= CRON_SAFETY_RESERVE_MS) {
        deadlineStops += 1;
        lines.push(`[pass=${totalPasses}] deadline stop — remaining=${Math.max(0, budgetRemaining())}ms`);
        break;
      }

      const remaining = budgetRemaining();
      const topicsLeft = queue.length - passTopics;
      const maxArticles = pickAdaptiveMaxArticles(remaining, work.backlog);
      const perTopicBudget = Math.max(
        10_000,
        Math.min(90_000, Math.floor((remaining - CRON_SAFETY_RESERVE_MS) / Math.max(1, topicsLeft))),
      );

      const criteria = {
        scoring_domain: work.topic.scoring_domain,
        scoring_tier1: work.topic.scoring_tier1,
        scoring_tier2: work.topic.scoring_tier2,
        scoring_tier3: work.topic.scoring_tier3,
        scoring_tier4: work.topic.scoring_tier4,
        scoring_tier5: work.topic.scoring_tier5,
      };

      // Stamp BEFORE scoring so a concurrent instance doesn't double-score this topic.
      await supabase
        .from("topics")
        .update({ last_scored_at: new Date().toISOString() })
        .eq("id", work.topic.id);

      const result = await scoreTopicForCron(work.topic.id, criteria, supabase, {
        windowHours: null, // score ALL unscored articles, not just recent ones
        maxArticles,
        maxArticlesCap: SCORE_HARD_ARTICLE_CAP,
        maxElapsedMs: perTopicBudget,
      });

      passScored += result.scored;
      totalScored += result.scored;
      passTopics += 1;

      // Update in-memory backlog so next iterations have accurate topicsLeft math.
      work.backlog = Math.max(0, work.backlog - result.scored);

      lines.push(
        `[pass=${totalPasses}] topic=${work.topic.id} backlog=${backlogMap.get(work.topic.id)!} scored=${result.scored}/${result.candidateCount} partial=${result.partial ? "1" : "0"} max=${maxArticles} budget=${perTopicBudget}ms elapsed=${result.elapsedMs}ms remaining=${Math.max(0, budgetRemaining())}ms errors=${result.errors.length}`,
      );
    }

    lines.push(
      `[pass=${totalPasses}] summary: topics=${passTopics} scored=${passScored} backlog_start=${totalBacklogThisPass} elapsed=${Date.now() - passStart}ms`,
    );

    if (deadlineStops > 0) break;
  }

  if (lines.length === 0) {
    console.log("[cron-scoring-background] All topics up to date — no unscored articles");
    return;
  }

  lines.push(
    `[run] cron=score-background topics_total=${rows.length} passes=${totalPasses} scored=${totalScored} deadline_stops=${deadlineStops} elapsed_ms=${elapsedMs()} budget_ms=${effectiveBudgetMs} interval_ms=${CRON_INTERVAL_MS} timeout_ms=${CRON_TIMEOUT_MS}`,
  );
  console.log(lines.join("\n"));
};
