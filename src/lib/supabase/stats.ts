import type { SupabaseClient } from "@supabase/supabase-js";
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

interface GlobalArticleKpisRow {
  total_articles: number | string;
  scored_articles: number | string;
  avg_score: number | string;
  hit_rate: number | string;
}

function emptyGlobalKpis(): GlobalKpis {
  return { totalArticles: 0, scoredArticles: 0, pctScored: 0, avgScore: 0, hitRate: 0 };
}

function roundOne(n: number): number {
  return Math.round(n * 10) / 10;
}

function buildGlobalKpis(total: number, scored: number, avgScore: number, hitRate: number): GlobalKpis {
  return {
    totalArticles: total,
    scoredArticles: scored,
    pctScored: total > 0 ? roundOne((scored / total) * 100) : 0,
    avgScore: roundOne(avgScore),
    hitRate: roundOne(hitRate),
  };
}

/** Fallback when migration 035 has not been applied yet. */
async function getGlobalKpisLegacy(supabase: SupabaseClient): Promise<GlobalKpis> {
  const [totalRes, scoredRes, hitRes] = await Promise.all([
    supabase.from("articles").select("*", { count: "exact", head: true }),
    supabase
      .from("articles")
      .select("*", { count: "exact", head: true })
      .not("relevance_score", "is", null),
    supabase
      .from("articles")
      .select("*", { count: "exact", head: true })
      .not("relevance_score", "is", null)
      .gte("relevance_score", 7),
  ]);

  if (totalRes.error) {
    console.error("[getGlobalKpis] total count failed:", totalRes.error.message);
  }

  const total = totalRes.count ?? 0;
  const scored = scoredRes.count ?? 0;
  const hit7 = hitRes.count ?? 0;

  return buildGlobalKpis(
    total,
    scored,
    0,
    scored > 0 ? (hit7 / scored) * 100 : 0,
  );
}

export async function getGlobalKpis(): Promise<GlobalKpis> {
  const clientP = getServerClient();
  if (!clientP) return emptyGlobalKpis();

  try {
    const supabase = await clientP;
    const { data, error } = await supabase.rpc("get_global_article_kpis");
    if (!error && data && typeof data === "object") {
      const row = data as GlobalArticleKpisRow;
      const total = Number(row.total_articles) || 0;
      const scored = Number(row.scored_articles) || 0;
      return buildGlobalKpis(
        total,
        scored,
        Number(row.avg_score) || 0,
        Number(row.hit_rate) || 0,
      );
    }
    if (error) {
      console.error("[getGlobalKpis] RPC failed, using legacy counts:", error.message);
    }
    return await getGlobalKpisLegacy(supabase);
  } catch (err) {
    console.error("[getGlobalKpis] unexpected error:", err);
    return emptyGlobalKpis();
  }
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
  } catch (err) {
    console.warn("[getAllArticlesForStats]", err);
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
  } catch (err) {
    console.warn("[getTopArticlesForStats]", err);
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
  } catch (err) {
    console.warn("[getActiveFeedsForStats]", err);
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
  } catch (err) {
    console.warn("[getHiddenTopicIds]", err);
    return [];
  }
}
