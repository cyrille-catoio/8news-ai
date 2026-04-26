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
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
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

    return !error;
  } catch {
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
  } catch {
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
  } catch {
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
    return !error;
  } catch {
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
    return !error;
  } catch {
    return false;
  }
}

/**
 * Fetches top articles restricted to a specific set of topic IDs.
 * Used when a user has personalized their topic list.
 */
export async function getTopArticlesForTopics(
  topicIds: string[],
  days: number,
  limit = 50,
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
      .not("relevance_score", "is", null)
      .in("topic", topicIds);

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
