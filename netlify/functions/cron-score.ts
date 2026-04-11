import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { scoreTopicForCron } from "./shared/score-topic";

const CRON_WALL_MS = 30_000;
const CRON_BUDGET_MS = Number(process.env.CRON_BUDGET_MS ?? 27_500);
const CRON_SAFETY_RESERVE_MS = Number(process.env.CRON_SAFETY_RESERVE_MS ?? 2_000);
const SCORE_FRESH_WINDOW_MIN = Number(process.env.SCORE_FRESH_WINDOW_MIN ?? 5);
const SCORE_MAX_ARTICLES_PER_RUN = Number(process.env.SCORE_MAX_ARTICLES_PER_RUN ?? 50);
const SCORE_MIN_ARTICLES_PER_RUN = Number(process.env.SCORE_MIN_ARTICLES_PER_RUN ?? 12);
const SCORE_HARD_ARTICLE_CAP = Number(process.env.SCORE_HARD_ARTICLE_CAP ?? 80);
const MULTI_TOPIC_BACKLOG_THRESHOLD = Number(process.env.MULTI_TOPIC_BACKLOG_THRESHOLD ?? 20);
const FAIRNESS_EVERY_N_TOPICS = Number(process.env.SCORE_FAIRNESS_EVERY_N_TOPICS ?? 4);

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
  freshBacklog: number;
};

function tsOrNull(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function pickAdaptiveMaxArticles(remainingMs: number, freshBacklog: number, backlog: number): number {
  const pressure = freshBacklog > 0 ? freshBacklog : backlog;
  const pressureBoost = pressure >= 120 ? 20 : pressure >= 60 ? 10 : pressure >= 20 ? 5 : 0;
  const timeCap = remainingMs > 14_000 ? 80 : remainingMs > 10_000 ? 70 : remainingMs > 6_500 ? 50 : 24;
  return clamp(
    SCORE_MAX_ARTICLES_PER_RUN + pressureBoost,
    SCORE_MIN_ARTICLES_PER_RUN,
    Math.min(timeCap, SCORE_HARD_ARTICLE_CAP),
  );
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
    return new Response(`DB error: ${error.message}`, { status: 500 });
  }

  if (!topics || topics.length === 0) return new Response("No active topics");

  const freshSinceIso = new Date(Date.now() - SCORE_FRESH_WINDOW_MIN * 60_000).toISOString();
  const rows = topics as TopicScoreRow[];
  const withBacklog = await Promise.all<TopicWork>(
    rows.map(async (topic) => {
      const [{ count: backlogCount }, { count: freshCount }] = await Promise.all([
        supabase
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("topic", topic.id)
          .is("relevance_score", null),
        supabase
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("topic", topic.id)
          .is("relevance_score", null)
          .gte("fetched_at", freshSinceIso),
      ]);
      return {
        topic,
        backlog: backlogCount ?? 0,
        freshBacklog: freshCount ?? 0,
      };
    }),
  );

  withBacklog.sort((a, b) => {
    const af = a.freshBacklog > 0 ? 1 : 0;
    const bf = b.freshBacklog > 0 ? 1 : 0;
    if (af !== bf) return bf - af;

    if (af > 0) {
      if (a.freshBacklog !== b.freshBacklog) return b.freshBacklog - a.freshBacklog;
      const fa = tsOrNull(a.topic.last_fetched_at);
      const fb = tsOrNull(b.topic.last_fetched_at);
      if (fa === null && fb === null) return a.topic.id.localeCompare(b.topic.id);
      if (fa === null) return 1;
      if (fb === null) return -1;
      return fb - fa;
    }

    const ha = a.backlog > 0 ? 1 : 0;
    const hb = b.backlog > 0 ? 1 : 0;
    if (ha !== hb) return hb - ha;

    if (ha > 0) {
      if (a.backlog !== b.backlog) return b.backlog - a.backlog;
      const sa = tsOrNull(a.topic.last_scored_at);
      const sb = tsOrNull(b.topic.last_scored_at);
      if (sa === null && sb === null) return a.topic.id.localeCompare(b.topic.id);
      if (sa === null) return -1;
      if (sb === null) return 1;
      return sa - sb;
    }

    return a.topic.id.localeCompare(b.topic.id);
  });

  const withBacklogOnly = withBacklog.filter((w) => w.backlog > 0);
  const fairCandidate = [...withBacklogOnly]
    .sort((a, b) => {
      const sa = tsOrNull(a.topic.last_scored_at);
      const sb = tsOrNull(b.topic.last_scored_at);
      if (sa === null && sb === null) return a.topic.id.localeCompare(b.topic.id);
      if (sa === null) return -1;
      if (sb === null) return 1;
      return sa - sb;
    })
    .at(0);

  const lines: string[] = [];
  let topicsProcessed = 0;
  let deadlineStops = 0;
  let totalScored = 0;
  let usedFairness = false;
  const processedIds = new Set<string>();

  const queue: TopicWork[] = [...withBacklog];
  while (queue.length > 0) {
    if (budgetRemaining() <= CRON_SAFETY_RESERVE_MS) {
      deadlineStops += 1;
      lines.push("[deadline] stopped — low remaining budget");
      break;
    }

    let work = queue.shift()!;
    if (
      !usedFairness &&
      fairCandidate &&
      topicsProcessed > 0 &&
      topicsProcessed % FAIRNESS_EVERY_N_TOPICS === 0 &&
      !processedIds.has(fairCandidate.topic.id)
    ) {
      work = fairCandidate;
      usedFairness = true;
    }

    if (processedIds.has(work.topic.id)) continue;
    processedIds.add(work.topic.id);

    if (topicsProcessed > 0 && work.backlog > MULTI_TOPIC_BACKLOG_THRESHOLD && work.freshBacklog === 0) {
      lines.push(
        `[skip] ${work.topic.id} backlog=${work.backlog} exceeds threshold for multi-topic`,
      );
      break;
    }

    const remaining = budgetRemaining();
    const maxArticles = pickAdaptiveMaxArticles(remaining, work.freshBacklog, work.backlog);
    const perTopicBudget = Math.max(
      2_500,
      Math.min(14_000, remaining - CRON_SAFETY_RESERVE_MS),
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

    totalScored += result.scored;
    topicsProcessed += 1;

    await supabase
      .from("topics")
      .update({ last_scored_at: new Date().toISOString() })
      .eq("id", work.topic.id);

    lines.push(
      `[metric] topic=${work.topic.id} fresh_backlog=${work.freshBacklog} backlog=${work.backlog} scored=${result.scored}/${result.candidateCount} partial=${result.partial ? "1" : "0"} max_articles=${maxArticles} elapsed_ms=${result.elapsedMs} remaining_ms=${Math.max(0, budgetRemaining())} errors=${result.errors.length}`,
    );
  }

  if (lines.length === 0) {
    return new Response("All topics up to date — no unscored articles");
  }

  lines.push(
    `[run] cron=score topics_total=${rows.length} topics_processed=${topicsProcessed} scored=${totalScored} deadline_stops=${deadlineStops} elapsed_ms=${Date.now() - startedAt} budget_ms=${Math.min(CRON_WALL_MS, CRON_BUDGET_MS)} fresh_window_min=${SCORE_FRESH_WINDOW_MIN}`,
  );
  return new Response(lines.join("\n"));
};

export const config: Config = { schedule: "* * * * *" };
