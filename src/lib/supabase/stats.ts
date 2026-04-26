import { getServerClient } from "./client";

/**
 * Stats dashboard helpers — KPIs, ranking lists, and per-feed/per-topic
 * counts powering `/app/stats`. None of these are on the hot path, so
 * they fan out to multiple `count: "exact"` queries without worrying
 * about per-row latency.
 */

export interface StatsArticleRow {
  source: string;
  topic: string;
  relevance_score: number | null;
  pub_date: string;
  scored_at: string | null;
}

export interface TopArticleRow {
  title: string;
  link: string;
  source: string;
  topic: string;
  pub_date: string;
  relevance_score: number;
  score_reason: string | null;
  snippet: string | null;
  content: string | null;
  snippet_ai_en: string | null;
  snippet_ai_fr: string | null;
}

export interface StatsFeedRow {
  topic_id: string;
  name: string;
  url: string;
}

export interface GlobalKpis {
  totalArticles: number;
  scoredArticles: number;
  pctScored: number;
  avgScore: number;
  hitRate: number;
}

export async function getGlobalKpis(): Promise<GlobalKpis> {
  const clientP = getServerClient();
  if (!clientP) return { totalArticles: 0, scoredArticles: 0, pctScored: 0, avgScore: 0, hitRate: 0 };

  const supabase = await clientP;
  const countByScore = (score: number) =>
    supabase.from("articles").select("id", { count: "exact", head: true }).eq("relevance_score", score);

  const [totalRes, ...scoreCountRes] = await Promise.all([
    supabase.from("articles").select("id", { count: "exact", head: true }),
    countByScore(1), countByScore(2), countByScore(3), countByScore(4), countByScore(5),
    countByScore(6), countByScore(7), countByScore(8), countByScore(9), countByScore(10),
  ]);

  const total = totalRes.count ?? 0;
  const counts = scoreCountRes.map((r) => r.count ?? 0);
  const scored = counts.reduce((s, c) => s + c, 0);
  const hit7 = counts[6] + counts[7] + counts[8] + counts[9];
  const weightedSum = counts.reduce((s, c, i) => s + c * (i + 1), 0);
  const avgScore = scored > 0 ? Math.round((weightedSum / scored) * 10) / 10 : 0;

  return {
    totalArticles: total,
    scoredArticles: scored,
    pctScored: total > 0 ? Math.round((scored / total) * 1000) / 10 : 0,
    avgScore,
    hitRate: scored > 0 ? Math.round((hit7 / scored) * 1000) / 10 : 0,
  };
}

export async function getAllArticlesForStats(): Promise<StatsArticleRow[]> {
  const clientP = getServerClient();
  if (!clientP) return [];

  try {
    const supabase = await clientP;
    const PAGE_SIZE = 1000;
    const allRows: StatsArticleRow[] = [];
    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from("articles")
        .select("source, topic, relevance_score, pub_date, scored_at")
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error || !data || data.length === 0) break;
      allRows.push(...(data as StatsArticleRow[]));
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return allRows;
  } catch {
    return [];
  }
}

export async function getTopArticlesForStats(
  topic: string | null,
  days: number,
  limit = 10,
  excludeTopics?: string[],
): Promise<TopArticleRow[]> {
  const clientP = getServerClient();
  if (!clientP) return [];

  try {
    const supabase = await clientP;
    let query = supabase
      .from("articles")
      .select(
        "title, link, source, topic, pub_date, relevance_score, score_reason, snippet, content, snippet_ai_en, snippet_ai_fr",
      )
      .not("relevance_score", "is", null);

    if (topic && topic !== "all") query = query.eq("topic", topic);
    if (excludeTopics && excludeTopics.length > 0) {
      query = query.not("topic", "in", `(${excludeTopics.join(",")})`);
    }
    if (days > 0) {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      query = query.gte("pub_date", since);
    }

    const { data, error } = await query
      .order("relevance_score", { ascending: false })
      .order("pub_date", { ascending: false })
      .order("link", { ascending: true })
      .limit(limit);

    if (error || !data) return [];
    return data as TopArticleRow[];
  } catch {
    return [];
  }
}

export async function getActiveFeedsForStats(): Promise<StatsFeedRow[]> {
  const clientP = getServerClient();
  if (!clientP) return [];

  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("feeds")
      .select("topic_id, name, url")
      .eq("is_active", true);
    if (error || !data) return [];
    return data as StatsFeedRow[];
  } catch {
    return [];
  }
}

export async function getHiddenTopicIds(): Promise<string[]> {
  const clientP = getServerClient();
  if (!clientP) return [];

  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("topics")
      .select("id")
      .eq("is_displayed", false);

    if (error || !data) return [];
    return data.map((r) => r.id);
  } catch {
    return [];
  }
}
