import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/auth-api";
import {
  getAllArticlesForStats,
  getActiveFeedsForStats,
  getTopArticlesForStats,
  getActiveTopics,
  getGlobalKpis,
  type StatsArticleRow,
} from "@/lib/supabase";
import type { StatsResponse } from "@/lib/types";

export const maxDuration = 30;

function roundOne(n: number): number {
  return Math.round(n * 10) / 10;
}

function pctOf(count: number, total: number): number {
  return total > 0 ? roundOne((count / total) * 100) : 0;
}

function buildScoreDistribution(scored: StatsArticleRow[]): StatsResponse["scoreDistribution"] {
  // v2.6.14+ collapsed the historical 5-bucket ladder (9-10 / 7-8 / 5-6 /
  // 3-4 / 1-2) down to the same 4 tiers `ScoreMeter` actually paints
  // — green ≥ 8, gold ≥ 5, orange ≥ 3, red < 3 — so the analytics
  // heatmap mirrors the per-article badge colors visitors see in the
  // product. Note: `topics.scoringTier1..5` (the LLM scoring rubric
  // for owners) is intentionally NOT collapsed — that 5-tier rubric
  // is editorial prompt text for the model, not a UI palette.
  const tiers: Array<{ label: string; min: number; max: number }> = [
    { label: "8-10", min: 8, max: 10 },
    { label: "5-7", min: 5, max: 7 },
    { label: "3-4", min: 3, max: 4 },
    { label: "1-2", min: 1, max: 2 },
  ];
  const total = scored.length;
  return tiers.map(({ label, min, max }) => {
    const count = scored.filter(
      (a) => a.relevance_score! >= min && a.relevance_score! <= max,
    ).length;
    return { tier: label, count, pct: pctOf(count, total) };
  });
}

interface FeedBucket {
  source: string;
  topic: string;
  total: number;
  scored: number;
  scores: number[];
}

function buildFeedRanking(
  articles: StatsArticleRow[],
  feedUrlByTopicAndSource: Map<string, string>,
): StatsResponse["feedRanking"] {
  const map = new Map<string, FeedBucket>();

  for (const a of articles) {
    const key = `${a.source}\0${a.topic}`;
    let b = map.get(key);
    if (!b) {
      b = { source: a.source, topic: a.topic, total: 0, scored: 0, scores: [] };
      map.set(key, b);
    }
    b.total++;
    if (a.relevance_score !== null) {
      b.scored++;
      b.scores.push(a.relevance_score);
    }
  }

  return Array.from(map.values())
    .filter((f) => f.scored > 0)
    .map((f) => {
      const sc = f.scores;
      const len = sc.length;
      const avg = sc.reduce((s, v) => s + v, 0) / len;
      return {
        source: f.source,
        topic: f.topic,
        sourceUrl: feedUrlByTopicAndSource.get(`${f.topic}\0${f.source}`),
        total: f.total,
        scored: f.scored,
        avgScore: roundOne(avg),
        hitRate: pctOf(sc.filter((s) => s >= 7).length, len),
        // v2.6.14+ 4-bucket ladder aligned with ScoreMeter (green ≥ 8,
        // gold ≥ 5, orange ≥ 3, red < 3). `hitRate` keeps its historical
        // ≥ 7 threshold — it represents "interesting articles" for
        // editorial / feed quality and predates the color ladder.
        pct8_10: pctOf(sc.filter((s) => s >= 8).length, len),
        pct5_7: pctOf(sc.filter((s) => s >= 5 && s <= 7).length, len),
        pct3_4: pctOf(sc.filter((s) => s >= 3 && s <= 4).length, len),
        pct1_2: pctOf(sc.filter((s) => s <= 2).length, len),
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore);
}

function buildTopicComparison(
  allArticles: StatsArticleRow[],
  feedCounts: Record<string, number>,
): StatsResponse["topicComparison"] {
  const cutoff7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const map = new Map<
    string,
    { total: number; scored: number; scores: number[]; activeSources: Set<string> }
  >();

  for (const a of allArticles) {
    let entry = map.get(a.topic);
    if (!entry) {
      entry = { total: 0, scored: 0, scores: [], activeSources: new Set() };
      map.set(a.topic, entry);
    }
    entry.total++;
    if (a.relevance_score !== null) {
      entry.scored++;
      entry.scores.push(a.relevance_score);
    }
    if (a.pub_date >= cutoff7d) {
      entry.activeSources.add(a.source);
    }
  }

  return Array.from(map.entries())
    .map(([topic, d]) => {
      const avg =
        d.scores.length > 0
          ? d.scores.reduce((s, v) => s + v, 0) / d.scores.length
          : 0;
      return {
        topic,
        total: d.total,
        scored: d.scored,
        pctScored: pctOf(d.scored, d.total),
        avgScore: roundOne(avg),
        hitRate: pctOf(
          d.scores.filter((s) => s >= 7).length,
          d.scores.length,
        ),
        activeSources: d.activeSources.size,
        totalFeeds: feedCounts[topic] ?? 0,
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore);
}

export async function GET(req: NextRequest) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const topic = searchParams.get("topic") || "all";
  const days = Math.max(0, parseFloat(searchParams.get("days") || "0") || 0);
  const kpiOnly = searchParams.get("kpi_only") === "1";

  if (kpiOnly) {
    const kpis = await getGlobalKpis();
    const response: StatsResponse = {
      global: { ...kpis, new24h: 0, new7d: 0, scored24h: 0 },
      scoreDistribution: [],
      feedRanking: [],
      topArticles: [],
      topicComparison: [],
    };
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  }

  const activeTopics = await getActiveTopics();
  const validIds = new Set(activeTopics.map((t) => t.id));

  if (topic !== "all" && !validIds.has(topic)) {
    return NextResponse.json({ error: "Invalid topic" }, { status: 400 });
  }

  const isTopicAll = topic === "all";

  // v2.6.14+ — push topic + days filters down to Postgres for the
  // primary dataset so a « pick a topic + last 24 h » drill-down doesn't
  // pay the whole-table scan tax. Two key savings:
  //  1. The cross-topic comparison block is only rendered when
  //     `topic === "all"` (see `StatsPage.tsx`), so we skip its
  //     unfiltered scan when the user has already drilled down.
  //  2. The primary dataset is now narrowed at the DB level — for a
  //     typical « AI + last 24 h » filter that goes from ~50K rows
  //     to a few hundred, an order-of-magnitude latency win.
  //
  // The cross-topic comparison keeps its unfiltered behavior (all-time
  // totals per topic) when `topic === "all"` — the period only filters
  // the headline KPIs / feed ranking / score distribution.
  const [filteredArticles, allArticlesForComparison, topArticles, activeFeeds] = await Promise.all([
    getAllArticlesForStats({
      topic: isTopicAll ? null : topic,
      days,
    }),
    isTopicAll
      ? getAllArticlesForStats()
      : Promise.resolve([] as StatsArticleRow[]),
    getTopArticlesForStats(isTopicAll ? null : topic, days, 500),
    getActiveFeedsForStats(),
  ]);

  const now = Date.now();

  // ── Filtered dataset (topic + period — already filtered at the DB) ──
  const filtered = filteredArticles;
  const filteredScored = filtered.filter((a) => a.relevance_score !== null);

  // ── KPIs (from filtered dataset) ──
  const totalArticles = filtered.length;
  const scoredArticles = filteredScored.length;
  const avgScore =
    scoredArticles > 0
      ? roundOne(filteredScored.reduce((s, a) => s + a.relevance_score!, 0) / scoredArticles)
      : 0;
  const hitRate = pctOf(
    filteredScored.filter((a) => (a.relevance_score ?? 0) >= 7).length,
    scoredArticles,
  );

  const cutoff24h = new Date(now - 24 * 3_600_000).toISOString();
  const cutoff7d = new Date(now - 7 * 86_400_000).toISOString();

  const new24h = filtered.filter((a) => a.pub_date >= cutoff24h).length;
  const new7d = filtered.filter((a) => a.pub_date >= cutoff7d).length;
  const scored24h = filtered.filter(
    (a) => a.scored_at && a.scored_at >= cutoff24h,
  ).length;

  const feedCounts: Record<string, number> = {};
  for (const tp of activeTopics) feedCounts[tp.id] = tp.feed_count;
  const feedUrlByTopicAndSource = new Map<string, string>();
  for (const feed of activeFeeds) {
    feedUrlByTopicAndSource.set(`${feed.topic_id}\0${feed.name}`, feed.url);
  }

  const response: StatsResponse = {
    global: {
      totalArticles,
      scoredArticles,
      pctScored: pctOf(scoredArticles, totalArticles),
      avgScore,
      hitRate,
      new24h,
      new7d,
      scored24h,
    },
    scoreDistribution: buildScoreDistribution(filteredScored),
    feedRanking: buildFeedRanking(filtered, feedUrlByTopicAndSource),
    topArticles: topArticles.map((a) => ({
      title: a.title,
      link: a.link,
      source: a.source,
      topic: a.topic,
      pubDate: a.pub_date,
      score: a.relevance_score,
      reason: a.score_reason ?? "",
    })),
    // Empty when a specific topic is selected — the StatsPage hides
    // the cross-topic comparison block in that case so we save the
    // unfiltered scan above. Always populated for `topic === "all"`.
    topicComparison: isTopicAll
      ? buildTopicComparison(allArticlesForComparison, feedCounts)
      : [],
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}
