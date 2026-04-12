import { createClient } from "@supabase/supabase-js";
import { scoreTopicForCron } from "./shared/score-topic";

const CRON_WALL_MS = 840_000;
const CRON_BUDGET_MS = Number(process.env.CRON_BUDGET_MS ?? 780_000);
const CRON_SAFETY_RESERVE_MS = Number(process.env.CRON_SAFETY_RESERVE_MS ?? 30_000);
const SCORE_FRESH_WINDOW_MIN = Number(process.env.SCORE_FRESH_WINDOW_MIN ?? 15);
const SCORE_MAX_ARTICLES_PER_RUN = Number(process.env.SCORE_MAX_ARTICLES_PER_RUN ?? 100);
const SCORE_MIN_ARTICLES_PER_RUN = Number(process.env.SCORE_MIN_ARTICLES_PER_RUN ?? 12);
const SCORE_HARD_ARTICLE_CAP = Number(process.env.SCORE_HARD_ARTICLE_CAP ?? 200);

type TopicScoreRow = {
  id: string;
  last_fetched_at: string | null;
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

function pickAdaptiveMaxArticles(remainingMs: number, backlog: number): number {
  const pressureBoost = backlog >= 200 ? 40 : backlog >= 100 ? 20 : backlog >= 40 ? 10 : 0;
  const timeCap = remainingMs > 600_000 ? 200 : remainingMs > 300_000 ? 150 : remainingMs > 120_000 ? 100 : remainingMs > 60_000 ? 60 : 30;
  return clamp(
    SCORE_MAX_ARTICLES_PER_RUN + pressureBoost,
    SCORE_MIN_ARTICLES_PER_RUN,
    Math.min(timeCap, SCORE_HARD_ARTICLE_CAP),
  );
}

async function getBacklogCounts(
  supabase: ReturnType<typeof createClient>,
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
  const startedAt = Date.now();
  const deadline = startedAt + Math.min(CRON_WALL_MS, CRON_BUDGET_MS);
  const budgetRemaining = () => deadline - Date.now();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: topics, error } = await supabase
    .from("topics")
    .select(
      "id, last_fetched_at, last_scored_at, scoring_domain, scoring_tier1, scoring_tier2, scoring_tier3, scoring_tier4, scoring_tier5",
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

  // ── Multi-pass loop: keep scoring until backlog is drained or budget runs out
  while (budgetRemaining() > CRON_SAFETY_RESERVE_MS) {
    totalPasses += 1;
    const passStart = Date.now();

    const backlogMap = await getBacklogCounts(supabase, rows.map((r) => r.id));
    const queue: TopicWork[] = rows
      .filter((r) => (backlogMap.get(r.id) ?? 0) > 0)
      .map((r) => ({ topic: r, backlog: backlogMap.get(r.id)! }))
      .sort((a, b) => b.backlog - a.backlog);

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
        lines.push(`[pass=${totalPasses}] deadline stop — low remaining budget`);
        break;
      }

      const remaining = budgetRemaining();
      const topicsLeft = queue.length - passTopics;
      const maxArticles = pickAdaptiveMaxArticles(remaining, work.backlog);
      const perTopicBudget = Math.max(
        10_000,
        Math.min(600_000, Math.floor((remaining - CRON_SAFETY_RESERVE_MS) / Math.max(1, topicsLeft))),
      );

      const criteria = {
        scoring_domain: work.topic.scoring_domain,
        scoring_tier1: work.topic.scoring_tier1,
        scoring_tier2: work.topic.scoring_tier2,
        scoring_tier3: work.topic.scoring_tier3,
        scoring_tier4: work.topic.scoring_tier4,
        scoring_tier5: work.topic.scoring_tier5,
      };

      const result = await scoreTopicForCron(work.topic.id, criteria, supabase, {
        windowHours: null,
        maxArticles,
        maxArticlesCap: SCORE_HARD_ARTICLE_CAP,
        maxElapsedMs: perTopicBudget,
      });

      passScored += result.scored;
      totalScored += result.scored;
      passTopics += 1;

      await supabase
        .from("topics")
        .update({ last_scored_at: new Date().toISOString() })
        .eq("id", work.topic.id);

      lines.push(
        `[pass=${totalPasses}] topic=${work.topic.id} backlog=${work.backlog} scored=${result.scored}/${result.candidateCount} partial=${result.partial ? "1" : "0"} max=${maxArticles} budget=${perTopicBudget}ms elapsed=${result.elapsedMs}ms remaining=${Math.max(0, budgetRemaining())}ms errors=${result.errors.length}`,
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
    `[run] cron=score-background topics_total=${rows.length} passes=${totalPasses} scored=${totalScored} deadline_stops=${deadlineStops} elapsed_ms=${Date.now() - startedAt} budget_ms=${Math.min(CRON_WALL_MS, CRON_BUDGET_MS)}`,
  );
  console.log(lines.join("\n"));
};
