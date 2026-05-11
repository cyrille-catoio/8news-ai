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
  image_url: string | null;
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

/**
 * Stats dataset loader for `/api/stats`.
 *
 * v2.6.14+: accepts optional `topic` + `days` filters that are pushed
 * down to Postgres via `WHERE topic = $1 AND pub_date >= $2`. Without
 * these, the helper still does what its name says and pulls the entire
 * `articles` table — historically used by the cross-topic comparison
 * block on the stats page.
 *
 * Why this matters: with no filter on a production DB the table easily
 * sits in the 50K-row range and Supabase serializes everything (~1.5 MB
 * JSON), making the « pick a topic + last 24 h » drill-down feel sluggish
 * even though the filtered dataset is two orders of magnitude smaller.
 * Pushing the filter down lets the planner use the `articles_topic_idx`
 * / `articles_pub_date_idx` indexes and ships back a small payload.
 */
export interface StatsArticlesQuery {
  topic?: string | null;
  /** Period window in days. 0 / undefined = no time filter. */
  days?: number;
}

export async function getAllArticlesForStats(
  query: StatsArticlesQuery = {},
): Promise<StatsArticleRow[]> {
  const clientP = getServerClient();
  if (!clientP) return [];

  try {
    const supabase = await clientP;
    const PAGE_SIZE = 1000;
    const allRows: StatsArticleRow[] = [];
    let offset = 0;

    const since =
      query.days && query.days > 0
        ? new Date(Date.now() - query.days * 86_400_000).toISOString()
        : null;

    while (true) {
      let q = supabase
        .from("articles")
        .select("source, topic, relevance_score, pub_date, scored_at");
      if (query.topic) q = q.eq("topic", query.topic);
      if (since) q = q.gte("pub_date", since);

      const { data, error } = await q
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
    const fullColumns =
      "title, link, source, topic, pub_date, relevance_score, score_reason, snippet, content, snippet_ai_en, snippet_ai_fr, image_url";
    const baseColumns =
      "title, link, source, topic, pub_date, relevance_score, score_reason, snippet, content, snippet_ai_en, snippet_ai_fr";

    const buildQuery = (columns: string) => {
      let q = supabase
        .from("articles")
        .select(columns)
        .not("relevance_score", "is", null);
      if (topic && topic !== "all") q = q.eq("topic", topic);
      if (excludeTopics && excludeTopics.length > 0) {
        q = q.not("topic", "in", `(${excludeTopics.join(",")})`);
      }
      if (days > 0) {
        const since = new Date(Date.now() - days * 86_400_000).toISOString();
        q = q.gte("pub_date", since);
      }
      return q
        .order("relevance_score", { ascending: false })
        .order("pub_date", { ascending: false })
        .order("link", { ascending: true })
        .limit(limit);
    };

    let res = await buildQuery(fullColumns);
    if (res.error && /image_url/i.test(res.error.message ?? "")) {
      res = await buildQuery(baseColumns);
    }
    if (res.error || !res.data) return [];
    return (res.data as unknown as Array<Omit<TopArticleRow, "image_url"> & { image_url?: string | null }>).map(
      (row) => ({
        ...row,
        image_url: row.image_url ?? null,
      }),
    ) as TopArticleRow[];
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
