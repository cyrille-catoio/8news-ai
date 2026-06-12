import { getServerClient } from "./client";
import type { TopArticleRow } from "./stats";

/**
 * Articles, user topic preferences, user favorites — the read paths
 * that power the SPA's main news flows (Top 50, All Articles, Daily
 * summaries source list, Favorites). Writes happen via the cron paths
 * (`fetch-topic-dynamic`, `score-topic-dynamic`) which insert directly.
 *
 * Per-user tables (`user_topic_preferences`, `user_favorites`) live
 * here with the article reads since they almost always render side
 * by side in the same UI surface.
 */

export interface DbArticle {
  id: number;
  topic: string;
  source: string;
  title: string;
  link: string;
  pub_date: string;
  fetched_at: string;
  content: string | null;
  snippet: string | null;
  snippet_ai_en: string | null;
  snippet_ai_fr: string | null;
  relevance_score: number | null;
}

export async function getScoredArticles(
  topic: string,
  since: string,
  minScore: number,
  limit: number,
  until?: string,
): Promise<DbArticle[]> {
  const clientP = getServerClient();
  if (!clientP) return [];

  try {
    const supabase = await clientP;
    let query = supabase
      .from("articles")
      .select("id, topic, source, title, link, pub_date, fetched_at, content, snippet, snippet_ai_en, snippet_ai_fr, relevance_score")
      .eq("topic", topic)
      .gte("fetched_at", since)
      .gte("relevance_score", minScore);
    if (until) query = query.lte("fetched_at", until);
    const { data, error } = await query
      .order("relevance_score", { ascending: false })
      .order("fetched_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data as DbArticle[];
  } catch (err) {
    console.warn("[getScoredArticles]", err);
    return [];
  }
}

/** Light row shape returned by `getScoredArticlesForTopics` — just what
 *  the home « Vos topics » strips render (no content/snippet payload). */
export interface TopicStripRow {
  topic: string;
  title: string;
  title_ai_en: string | null;
  title_ai_fr: string | null;
  link: string;
  source: string;
  pub_date: string;
  relevance_score: number | null;
}

/**
 * Batch read powering `GET /api/news/strips` (home « Vos topics »
 * section): one `.in("topic", …)` query over every candidate topic
 * instead of one `/api/news` round-trip (and LLM analysis) per topic.
 * Rows come back globally sorted by score desc then recency; the
 * per-topic regrouping/capping is `groupArticlesByTopic()` in
 * `src/lib/topic-strips.ts`.
 */
export async function getScoredArticlesForTopics(
  topicIds: string[],
  since: string,
  minScore: number,
  limit: number,
): Promise<TopicStripRow[]> {
  const clientP = getServerClient();
  if (!clientP || topicIds.length === 0) return [];

  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("articles")
      .select("topic, title, title_ai_en, title_ai_fr, link, source, pub_date, relevance_score")
      .in("topic", topicIds)
      .gte("fetched_at", since)
      .gte("relevance_score", minScore)
      .order("relevance_score", { ascending: false })
      .order("fetched_at", { ascending: false })
      .limit(limit);

    if (error || !data) {
      if (error) console.warn("[getScoredArticlesForTopics]", error.message);
      return [];
    }
    return data as TopicStripRow[];
  } catch (err) {
    console.warn("[getScoredArticlesForTopics]", err);
    return [];
  }
}

export async function getAllArticlesFromDb(
  topic: string,
  since: string,
  limit: number,
): Promise<DbArticle[]> {
  const clientP = getServerClient();
  if (!clientP) return [];

  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("articles")
      .select("id, topic, source, title, link, pub_date, content, snippet, snippet_ai_en, snippet_ai_fr, relevance_score")
      .eq("topic", topic)
      .gte("pub_date", since)
      .order("relevance_score", { ascending: false, nullsFirst: false })
      .order("pub_date", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data as DbArticle[];
  } catch (err) {
    console.warn("[getAllArticlesFromDb]", err);
    return [];
  }
}

export async function countArticlesForPeriod(
  topic: string,
  since: string,
  until?: string,
): Promise<{ total: number; scored: number }> {
  const clientP = getServerClient();
  if (!clientP) return { total: 0, scored: 0 };

  try {
    const supabase = await clientP;
    let totalQ = supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("topic", topic)
      .gte("fetched_at", since);
    if (until) totalQ = totalQ.lte("fetched_at", until);

    let scoredQ = supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("topic", topic)
      .gte("fetched_at", since)
      .not("relevance_score", "is", null);
    if (until) scoredQ = scoredQ.lte("fetched_at", until);

    const [totalRes, scoredRes] = await Promise.all([totalQ, scoredQ]);
    return {
      total: totalRes.count ?? 0,
      scored: scoredRes.count ?? 0,
    };
  } catch (err) {
    console.warn("[countArticlesForPeriod]", err);
    return { total: 0, scored: 0 };
  }
}

/**
 * Returns the user's preferred topic IDs, or null if no preference is set.
 * null means "show all topics" (default behavior).
 */
export async function getUserTopicPreferences(
  userId: string,
): Promise<string[] | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("user_topic_preferences")
      .select("topic_ids")
      .eq("user_id", userId)
      .single();

    if (error || !data) return null;
    // Return the actual array: [] means "set but no filter" (onboarding done),
    // null means "no row" (onboarding not done yet).
    return (data as { topic_ids: string[] }).topic_ids;
  } catch (err) {
    console.warn("[getUserTopicPreferences]", err);
    return null;
  }
}

/**
 * Upserts the user's preferred topic IDs.
 * Pass an empty array to clear preferences (show all topics).
 */
export async function setUserTopicPreferences(
  userId: string,
  topicIds: string[],
): Promise<boolean> {
  const clientP = getServerClient();
  if (!clientP) return false;

  try {
    const supabase = await clientP;
    const { error } = await supabase
      .from("user_topic_preferences")
      .upsert(
        { user_id: userId, topic_ids: topicIds, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );

    if (error) {
      console.error("[setUserTopicPreferences] upsert failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[setUserTopicPreferences]", err);
    return false;
  }
}

export interface UserFavoriteRow {
  id: number;
  user_id: string;
  article_url: string;
  article_title: string;
  article_source: string;
  article_date: string | null;
  source_type: string;
  created_at: string;
}

export async function getUserFavorites(userId: string): Promise<UserFavoriteRow[]> {
  const clientP = getServerClient();
  if (!clientP) return [];
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("user_favorites")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data as UserFavoriteRow[];
  } catch (err) {
    console.warn("[getUserFavorites]", err);
    return [];
  }
}

export async function getUserFavoriteUrls(userId: string): Promise<string[]> {
  const clientP = getServerClient();
  if (!clientP) return [];
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("user_favorites")
      .select("article_url")
      .eq("user_id", userId);
    if (error || !data) return [];
    return (data as { article_url: string }[]).map((r) => r.article_url);
  } catch (err) {
    console.warn("[getUserFavoriteUrls]", err);
    return [];
  }
}

export async function addUserFavorite(
  userId: string,
  article: { url: string; title: string; source: string; pubDate?: string; sourceType?: string },
): Promise<boolean> {
  const clientP = getServerClient();
  if (!clientP) return false;
  try {
    const supabase = await clientP;
    const { error } = await supabase.from("user_favorites").upsert(
      {
        user_id: userId,
        article_url: article.url,
        article_title: article.title,
        article_source: article.source,
        article_date: article.pubDate || null,
        source_type: article.sourceType || "article",
      },
      { onConflict: "user_id,article_url" },
    );
    if (error) {
      console.error("[addUserFavorite] upsert failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[addUserFavorite]", err);
    return false;
  }
}

export async function removeUserFavorite(userId: string, articleUrl: string): Promise<boolean> {
  const clientP = getServerClient();
  if (!clientP) return false;
  try {
    const supabase = await clientP;
    const { error } = await supabase
      .from("user_favorites")
      .delete()
      .eq("user_id", userId)
      .eq("article_url", articleUrl);
    if (error) {
      console.error("[removeUserFavorite] delete failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[removeUserFavorite]", err);
    return false;
  }
}

/**
 * Fetches top articles restricted to a specific set of topic IDs.
 * Used when a user has personalized their topic list.
 */
/** Lookup RSS artwork by canonical article URL — used to backfill
 *  `imageUrl` on frozen `top_summaries` snapshots written before
 *  mig. 027 or before the next cron tick. */
export async function getArticleImageUrlsByLinks(
  links: string[],
): Promise<Map<string, string>> {
  const clientP = getServerClient();
  if (!clientP || links.length === 0) return new Map();

  const unique = Array.from(new Set(links.map((l) => l.trim()).filter(Boolean)));
  if (unique.length === 0) return new Map();

  try {
    const supabase = await clientP;
    const res = await supabase
      .from("articles")
      .select("link, image_url")
      .in("link", unique);
    if (res.error && /image_url/i.test(res.error.message ?? "")) {
      return new Map();
    }
    if (res.error || !res.data) return new Map();
    const out = new Map<string, string>();
    for (const row of res.data as Array<{ link: string; image_url: string | null }>) {
      const url = row.image_url?.trim();
      if (url) out.set(row.link, url);
    }
    return out;
  } catch (err) {
    console.warn("[getArticleImageUrlsByLinks]", err);
    return new Map();
  }
}

export async function getTopArticlesForTopics(
  topicIds: string[],
  days: number,
  limit = 50,
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
        .not("relevance_score", "is", null)
        .in("topic", topicIds);
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
    console.warn("[getTopArticlesForTopics]", err);
    return [];
  }
}
