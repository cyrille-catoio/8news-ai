import { NextRequest, NextResponse } from "next/server";
import {
  getAllArticlesForStats,
  getAllFeedsRows,
  type StatsArticleRow,
} from "@/lib/supabase";

function roundOne(n: number): number {
  return Math.round(n * 10) / 10;
}

function pctOf(count: number, total: number): number {
  return total > 0 ? roundOne((count / total) * 100) : 0;
}

function buildBuckets(articles: StatsArticleRow[]) {
  const map = new Map<string, { total: number; scored: number; scores: number[] }>();
  for (const a of articles) {
    const key = `${a.topic}\0${a.source}`;
    let b = map.get(key);
    if (!b) b = { total: 0, scored: 0, scores: [] };
    b.total++;
    if (a.relevance_score !== null) {
      b.scored++;
      b.scores.push(a.relevance_score);
    }
    map.set(key, b);
  }
  return map;
}

export async function GET(req: NextRequest) {
  try {
    const topic = req.nextUrl.searchParams.get("topic") ?? "all";
    if (topic !== "all" && !/^[a-z0-9_-]+$/i.test(topic)) {
      return NextResponse.json({ error: "Invalid topic" }, { status: 400 });
    }

    const [feeds, articles] = await Promise.all([
      getAllFeedsRows(),
      getAllArticlesForStats(),
    ]);

    const buckets = buildBuckets(articles);
    const filtered =
      topic === "all" ? feeds : feeds.filter((f) => f.topic_id === topic);

    const rows = filtered.map((f) => {
      const b = buckets.get(`${f.topic_id}\0${f.name}`) ?? {
        total: 0,
        scored: 0,
        scores: [] as number[],
      };
      const len = b.scores.length;
      const avgScore =
        len > 0 ? roundOne(b.scores.reduce((s, v) => s + v, 0) / len) : null;
      const hitRateGte7 =
        len > 0 ? pctOf(b.scores.filter((s) => s >= 7).length, len) : 0;

      return {
        id: f.id,
        topicId: f.topic_id,
        source: f.name,
        url: f.url,
        isActive: f.is_active,
        createdAt: f.created_at,
        totalArticles: b.total,
        scoredArticles: b.scored,
        avgScore,
        hitRateGte7,
      };
    });

    return NextResponse.json({ feeds: rows }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load feeds admin data" },
      { status: 500 },
    );
  }
}
