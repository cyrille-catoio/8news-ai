import { NextResponse } from "next/server";
import { getActiveTopics } from "@/lib/supabase";
import type { CronStatsResponse } from "@/lib/types";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require("@supabase/supabase-js");
  return createClient(url, key, { auth: { persistSession: false } });
}

function roundOne(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function GET() {
  const supabase = getServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "DB not configured" }, { status: 500 });
  }

  const topics = await getActiveTopics(true);
  const now = Date.now();
  const since24h = new Date(now - 24 * 3_600_000).toISOString();
  const since7d = new Date(now - 7 * 86_400_000).toISOString();

  const [backlogRes, recentRes, scoredRecentRes] = await Promise.all([
    supabase
      .from("articles")
      .select("topic", { count: "exact", head: false })
      .gte("pub_date", since7d)
      .is("relevance_score", null),
    supabase
      .from("articles")
      .select("pub_date, scored_at, topic")
      .gte("pub_date", since24h),
    supabase
      .from("articles")
      .select("pub_date, scored_at")
      .gte("scored_at", since24h)
      .not("scored_at", "is", null),
  ]);

  const backlogRows: Array<{ topic: string }> = backlogRes.data ?? [];
  const recentRows: Array<{ pub_date: string; scored_at: string | null; topic: string }> = recentRes.data ?? [];
  const scoredRecentRows: Array<{ pub_date: string; scored_at: string }> = scoredRecentRes.data ?? [];

  // ── Global KPIs ──
  const totalBacklog = backlogRows.length;
  const fetched24h = recentRows.length;
  const scored24h = recentRows.filter((r) => r.scored_at !== null).length;
  const coverage24h = fetched24h > 0 ? roundOne((scored24h / fetched24h) * 100) : 0;

  let avgDelayMinutes = 0;
  if (scoredRecentRows.length > 0) {
    const delays = scoredRecentRows
      .map((r) => {
        const pub = new Date(r.pub_date).getTime();
        const sc = new Date(r.scored_at).getTime();
        return sc > pub ? (sc - pub) / 60_000 : 0;
      })
      .filter((d) => d > 0);
    avgDelayMinutes = delays.length > 0
      ? roundOne(delays.reduce((s, v) => s + v, 0) / delays.length)
      : 0;
  }

  // ── Backlog per topic ──
  const backlogByTopic = new Map<string, number>();
  for (const r of backlogRows) {
    backlogByTopic.set(r.topic, (backlogByTopic.get(r.topic) ?? 0) + 1);
  }

  // ── Topic status ──
  const topicStatuses: CronStatsResponse["topics"] = topics.map((tp) => {
    const backlog = backlogByTopic.get(tp.id) ?? 0;
    const fetchAge = tp.last_fetched_at
      ? (now - new Date(tp.last_fetched_at).getTime()) / 60_000
      : Infinity;
    const scoreAge = tp.last_scored_at
      ? (now - new Date(tp.last_scored_at).getTime()) / 60_000
      : Infinity;

    let status: "ok" | "slow" | "high" = "ok";
    if (backlog > 200 || fetchAge > 30 || scoreAge > 30) {
      status = "high";
    } else if (backlog >= 50 || fetchAge > 15 || scoreAge > 15) {
      status = "slow";
    }

    return {
      id: tp.id,
      label: tp.label_en,
      lastFetchedAt: tp.last_fetched_at,
      lastScoredAt: tp.last_scored_at,
      backlog,
      status,
    };
  });

  // ── Timeline (hourly buckets, last 24h) ──
  const fetchBuckets = new Map<string, number>();
  const scoreBuckets = new Map<string, number>();

  for (const r of recentRows) {
    const h = r.pub_date.slice(0, 13) + ":00:00Z";
    fetchBuckets.set(h, (fetchBuckets.get(h) ?? 0) + 1);
    if (r.scored_at) {
      const sh = r.scored_at.slice(0, 13) + ":00:00Z";
      scoreBuckets.set(sh, (scoreBuckets.get(sh) ?? 0) + 1);
    }
  }

  const allHours = new Set([...fetchBuckets.keys(), ...scoreBuckets.keys()]);
  const timeline: CronStatsResponse["timeline"] = Array.from(allHours)
    .sort((a, b) => b.localeCompare(a))
    .map((hour) => ({
      hour,
      fetched: fetchBuckets.get(hour) ?? 0,
      scored: scoreBuckets.get(hour) ?? 0,
    }));

  const response: CronStatsResponse = {
    global: {
      backlog: totalBacklog,
      fetched24h,
      scored24h,
      coverage24h,
      avgDelayMinutes,
    },
    topics: topicStatuses,
    timeline,
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}
