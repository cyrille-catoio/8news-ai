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

  /** PostgREST max rows per response (Supabase default). Request wider ranges but only get 1000 → must page with this size. */
  const FETCH_BATCH = 1000;

  async function paginateBacklog(since: string): Promise<{ topic: string }[]> {
    const all: { topic: string }[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("articles")
        .select("topic")
        .gte("pub_date", since)
        .is("relevance_score", null)
        .range(from, from + FETCH_BATCH - 1);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < FETCH_BATCH) break;
      from += FETCH_BATCH;
    }
    return all;
  }

  async function paginateRecent(since: string): Promise<{ pub_date: string; scored_at: string | null; topic: string }[]> {
    const all: { pub_date: string; scored_at: string | null; topic: string }[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("articles")
        .select("pub_date, scored_at, topic")
        .gte("pub_date", since)
        .range(from, from + FETCH_BATCH - 1);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < FETCH_BATCH) break;
      from += FETCH_BATCH;
    }
    return all;
  }

  /** Cohorte « fetch 24h » (même fenêtre que fetched24h : pub_date) + uniquement articles déjà scorés. */
  async function paginateDelayCohort(since: string): Promise<{ pub_date: string; scored_at: string }[]> {
    const all: { pub_date: string; scored_at: string }[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("articles")
        .select("pub_date, scored_at")
        .gte("pub_date", since)
        .not("relevance_score", "is", null)
        .not("scored_at", "is", null)
        .range(from, from + FETCH_BATCH - 1);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < FETCH_BATCH) break;
      from += FETCH_BATCH;
    }
    return all;
  }

  const [backlogRows, recentRows, delayCohortRows] = await Promise.all([
    paginateBacklog(since7d),
    paginateRecent(since24h),
    paginateDelayCohort(since24h),
  ]);

  // ── Global KPIs ──
  const totalBacklog = backlogRows.length;
  const fetched24h = recentRows.length;
  const scored24h = recentRows.filter((r) => r.scored_at !== null).length;
  const coverage24h = fetched24h > 0 ? roundOne((scored24h / fetched24h) * 100) : 0;

  let avgDelayMinutes = 0;
  if (delayCohortRows.length > 0) {
    const delays = delayCohortRows
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
    let statusReason = "";
    if (backlog > 200) {
      status = "high"; statusReason = "backlog";
    } else if (fetchAge > 30) {
      status = "high"; statusReason = "fetch";
    } else if (scoreAge > 30) {
      status = "high"; statusReason = "score";
    } else if (backlog >= 50) {
      status = "slow"; statusReason = "backlog";
    } else if (fetchAge > 15) {
      status = "slow"; statusReason = "fetch";
    } else if (scoreAge > 15) {
      status = "slow"; statusReason = "score";
    }

    return {
      id: tp.id,
      label: tp.label_en,
      lastFetchedAt: tp.last_fetched_at,
      lastScoredAt: tp.last_scored_at,
      backlog,
      status,
      statusReason,
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
