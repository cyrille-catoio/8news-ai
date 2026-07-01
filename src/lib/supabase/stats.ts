import type { SupabaseClient } from "@supabase/supabase-js";
import { withClient } from "./client";

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

interface GlobalScoreAggRow {
  avg_score?: number | string | null;
}

export function parseGlobalAvgScoreAgg(data: unknown): number {
  const row = Array.isArray(data) ? (data[0] as GlobalScoreAggRow | undefined) : undefined;
  const raw = row?.avg_score;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Fallback when migration 035 has not been applied yet. */
async function getGlobalKpisLegacy(supabase: SupabaseClient): Promise<GlobalKpis> {
  const [totalRes, scoredRes, hitRes, avgRes] = await Promise.all([
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
    supabase
      .from("articles")
      .select("avg_score:relevance_score.avg()")
      .not("relevance_score", "is", null),
  ]);

  if (totalRes.error) {
    console.error("[getGlobalKpis] total count failed:", totalRes.error.message);
  }

  const total = totalRes.count ?? 0;
  const scored = scoredRes.count ?? 0;
  const hit7 = hitRes.count ?? 0;
  const avgScore = avgRes.error ? 0 : parseGlobalAvgScoreAgg(avgRes.data);
  if (avgRes.error) {
    console.error("[getGlobalKpis] avg score failed:", avgRes.error.message);
  }

  return buildGlobalKpis(
    total,
    scored,
    avgScore,
    scored > 0 ? (hit7 / scored) * 100 : 0,
  );
}

export async function getGlobalKpis(): Promise<GlobalKpis> {
  return withClient("getGlobalKpis", emptyGlobalKpis(), async (supabase) => {
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
  }, "error");
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
  return withClient("getAllArticlesForStats", [] as StatsArticleRow[], async (supabase) => {
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

      if (error) {
        console.warn("[getAllArticlesForStats] page query failed — stats truncated:", error.message);
        break;
      }
      if (!data || data.length === 0) break;
      allRows.push(...(data as StatsArticleRow[]));
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return allRows;
  });
}

export async function getTopArticlesForStats(
  topic: string | null,
  days: number,
  limit = 10,
  excludeTopics?: string[],
): Promise<TopArticleRow[]> {
  return withClient("getTopArticlesForStats", [] as TopArticleRow[], async (supabase) => {
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
  });
}

export async function getActiveFeedsForStats(): Promise<StatsFeedRow[]> {
  return withClient("getActiveFeedsForStats", [] as StatsFeedRow[], async (supabase) => {
    const { data, error } = await supabase
      .from("feeds")
      .select("topic_id, name, url")
      .eq("is_active", true);
    if (error || !data) return [];
    return data as StatsFeedRow[];
  });
}

export async function getHiddenTopicIds(): Promise<string[]> {
  return withClient("getHiddenTopicIds", [] as string[], async (supabase) => {
    const { data, error } = await supabase
      .from("topics")
      .select("id")
      .eq("is_displayed", false);

    if (error || !data) return [];
    return data.map((r) => r.id);
  });
}
