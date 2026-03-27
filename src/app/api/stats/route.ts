import { NextRequest, NextResponse } from "next/server";
import {
  getAllArticlesForStats,
  getTopArticlesForStats,
  getActiveTopics,
  type StatsArticleRow,
} from "@/lib/supabase";
import type { StatsResponse } from "@/lib/types";

function roundOne(n: number): number {
  return Math.round(n * 10) / 10;
}

function pctOf(count: number, total: number): number {
  return total > 0 ? roundOne((count / total) * 100) : 0;
}

function buildScoreDistribution(scored: StatsArticleRow[]): StatsResponse["scoreDistribution"] {
  const tiers: Array<{ label: string; min: number; max: number }> = [
    { label: "9-10", min: 9, max: 10 },
    { label: "7-8", min: 7, max: 8 },
    { label: "5-6", min: 5, max: 6 },
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

function buildFeedRanking(articles: StatsArticleRow[]): StatsResponse["feedRanking"] {
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
        total: f.total,
        scored: f.scored,
        avgScore: roundOne(avg),
        hitRate: pctOf(sc.filter((s) => s >= 7).length, len),
        pct9_10: pctOf(sc.filter((s) => s >= 9).length, len),
        pct7_8: pctOf(sc.filter((s) => s >= 7 && s <= 8).length, len),
        pct5_6: pctOf(sc.filter((s) => s >= 5 && s <= 6).length, len),
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
  const { searchParams } = req.nextUrl;
  const topic = searchParams.get("topic") || "all";
  const days = Math.max(0, parseInt(searchParams.get("days") || "0", 10) || 0);

  const activeTopics = await getActiveTopics();
  const validIds = new Set(activeTopics.map((t) => t.id));

  if (topic !== "all" && !validIds.has(topic)) {
    return NextResponse.json({ error: "Invalid topic" }, { status: 400 });
  }

  const [allArticles, topArticles] = await Promise.all([
    getAllArticlesForStats(),
    getTopArticlesForStats(topic === "all" ? null : topic, days),
  ]);

  const now = Date.now();

  // ── Filtered dataset (topic + period) ──
  let filtered = allArticles;
  if (topic !== "all") filtered = filtered.filter((a) => a.topic === topic);
  if (days > 0) {
    const since = new Date(now - days * 86_400_000).toISOString();
    filtered = filtered.filter((a) => a.pub_date >= since);
  }
  const filteredScored = filtered.filter((a) => a.relevance_score !== null);

  // ── KPIs (from filtered dataset) ──
  const totalArticles = filtered.length;
  const scoredArticles = filteredScored.length;
  const avgScore =
    scoredArticles > 0
      ? roundOne(filteredScored.reduce((s, a) => s + a.relevance_score!, 0) / scoredArticles)
      : 0;

  const cutoff24h = new Date(now - 24 * 3_600_000).toISOString();
  const cutoff7d = new Date(now - 7 * 86_400_000).toISOString();

  const new24h = filtered.filter((a) => a.pub_date >= cutoff24h).length;
  const new7d = filtered.filter((a) => a.pub_date >= cutoff7d).length;
  const scored24h = filtered.filter(
    (a) => a.scored_at && a.scored_at >= cutoff24h,
  ).length;

  const feedCounts: Record<string, number> = {};
  for (const tp of activeTopics) feedCounts[tp.id] = tp.feed_count;

  const response: StatsResponse = {
    global: {
      totalArticles,
      scoredArticles,
      pctScored: pctOf(scoredArticles, totalArticles),
      avgScore,
      new24h,
      new7d,
      scored24h,
    },
    scoreDistribution: buildScoreDistribution(filteredScored),
    feedRanking: buildFeedRanking(filtered),
    topArticles: topArticles.map((a) => ({
      title: a.title,
      link: a.link,
      source: a.source,
      topic: a.topic,
      pubDate: a.pub_date,
      score: a.relevance_score,
      reason: a.score_reason ?? "",
    })),
    topicComparison: buildTopicComparison(allArticles, feedCounts),
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}
