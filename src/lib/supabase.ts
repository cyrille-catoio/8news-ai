import type { SupabaseClient } from "@supabase/supabase-js";

let _clientPromise: Promise<SupabaseClient> | null = null;

function getServerClient(): Promise<SupabaseClient> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  if (!_clientPromise) {
    _clientPromise = import("@supabase/supabase-js").then((mod) =>
      mod.createClient(url, key, { auth: { persistSession: false } }),
    );
  }
  return _clientPromise;
}

/**
 * TTL of the server-side cache for AI news summaries, picked by the time
 * window the user is asking for. Always non-decreasing: a shorter window
 * means fresher data is more valuable, so we re-spend OpenAI tokens sooner.
 *
 * ≤1h → 5 min, ≤6h / ≤24h → 10 min, >24h → 30 min.
 */
function getCacheTtlMinutes(hours: number): number {
  if (hours <= 1) return 5;
  if (hours <= 6) return 10;
  if (hours <= 24) return 10;
  return 30;
}

export interface CachedResponse {
  summary: string;
  bullets: Array<{ text: string; refs: Array<{ title: string; link: string; source: string }> }>;
  articles: Array<{ title: string; link: string; source: string; pubDate: string; snippet: string }>;
  allArticles: Array<{ title: string; link: string; source: string; pubDate: string; snippet: string }>;
  period: { from: string; to: string };
}

export async function getCachedResult(
  topic: string,
  lang: string,
  hours: number,
  maxArticles: number,
): Promise<CachedResponse | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;
    const ttl = getCacheTtlMinutes(hours);
    const cutoff = new Date(Date.now() - ttl * 60_000).toISOString();

    const { data, error } = await supabase
      .from("news_cache")
      .select("response")
      .eq("topic", topic)
      .eq("lang", lang)
      .eq("hours", hours)
      .eq("max_articles", maxArticles)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return (data as Record<string, unknown>).response as CachedResponse;
  } catch {
    return null;
  }
}

export async function setCachedResult(
  topic: string,
  lang: string,
  hours: number,
  maxArticles: number,
  response: CachedResponse,
): Promise<void> {
  const clientP = getServerClient();
  if (!clientP) return;

  try {
    const supabase = await clientP;
    await supabase.from("news_cache").insert({
      topic,
      lang,
      hours,
      max_articles: maxArticles,
      response: response as unknown,
    });
  } catch {
    // Cache write failure is non-critical
  }
}

export async function cleanExpiredCache(): Promise<void> {
  const clientP = getServerClient();
  if (!clientP) return;

  try {
    const supabase = await clientP;
    const cutoff = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await supabase.from("news_cache").delete().lt("created_at", cutoff);
  } catch {
    // Cleanup failure is non-critical
  }
}

// ── Stats ──────────────────────────────────────────────────────────────

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

// ── Topics & Feeds CRUD ─────────────────────────────────────────────────

export interface TopicRow {
  id: string;
  label_en: string;
  label_fr: string;
  scoring_domain: string;
  scoring_tier1: string;
  scoring_tier2: string;
  scoring_tier3: string;
  scoring_tier4: string;
  scoring_tier5: string;
  prompt_en: string;
  prompt_fr: string;
  is_active: boolean;
  is_displayed: boolean;
  sort_order: number;
  category_id: number | null;
  last_fetched_at: string | null;
  last_scored_at: string | null;
  created_at: string;
}

export interface CategoryRow {
  id: number;
  slug: string;
  label_en: string;
  label_fr: string;
  sort_order: number;
}

export interface FeedRow {
  id: number;
  topic_id: string;
  name: string;
  url: string;
  is_active: boolean;
  created_at: string;
}

export async function getCategories(): Promise<CategoryRow[]> {
  const clientP = getServerClient();
  if (!clientP) return [];
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("categories")
      .select("id, slug, label_en, label_fr, sort_order")
      .order("sort_order", { ascending: true });
    if (error || !data) return [];
    return data as CategoryRow[];
  } catch {
    return [];
  }
}

export async function createCategory(
  data: { slug: string; label_en: string; label_fr: string; sort_order: number },
): Promise<CategoryRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  try {
    const supabase = await clientP;
    const { data: row, error } = await supabase
      .from("categories")
      .insert(data)
      .select()
      .single();
    if (error || !row) return null;
    return row as CategoryRow;
  } catch {
    return null;
  }
}

export async function updateCategory(
  id: number,
  data: Partial<Omit<CategoryRow, "id">>,
): Promise<CategoryRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  try {
    const supabase = await clientP;
    const { data: row, error } = await supabase
      .from("categories")
      .update(data)
      .eq("id", id)
      .select()
      .single();
    if (error || !row) return null;
    return row as CategoryRow;
  } catch {
    return null;
  }
}

export async function deleteCategory(id: number): Promise<boolean> {
  const clientP = getServerClient();
  if (!clientP) return false;
  try {
    const supabase = await clientP;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

export async function getActiveTopics(includeInactive = false): Promise<
  (TopicRow & { feed_count: number; category_label_en?: string; category_label_fr?: string })[]
> {
  const clientP = getServerClient();
  if (!clientP) return [];

  try {
    const supabase = await clientP;

    let query = supabase
      .from("topics")
      .select("*, categories(label_en, label_fr)")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true).eq("is_displayed", true);
    }

    const { data: topics, error } = await query;

    if (error || !topics) return [];

    const { data: counts } = await supabase
      .from("feeds")
      .select("topic_id")
      .eq("is_active", true);

    const countMap = new Map<string, number>();
    if (counts) {
      for (const row of counts) {
        countMap.set(row.topic_id, (countMap.get(row.topic_id) ?? 0) + 1);
      }
    }

    type TopicWithCat = TopicRow & { categories: { label_en: string; label_fr: string } | null };
    return (topics as TopicWithCat[]).map(({ categories: cat, ...row }) => ({
      ...row,
      feed_count: countMap.get(row.id) ?? 0,
      category_label_en: cat?.label_en,
      category_label_fr: cat?.label_fr,
    }));
  } catch {
    return [];
  }
}

export async function getTopicWithFeeds(
  id: string,
): Promise<(TopicRow & { feeds: FeedRow[] }) | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;

    const { data: topic, error } = await supabase
      .from("topics")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !topic) return null;

    const { data: feeds } = await supabase
      .from("feeds")
      .select("*")
      .eq("topic_id", id)
      .order("created_at", { ascending: true });

    return { ...(topic as TopicRow), feeds: (feeds ?? []) as FeedRow[] };
  } catch {
    return null;
  }
}

export async function createTopic(
  data: Omit<TopicRow, "is_active" | "is_displayed" | "last_fetched_at" | "last_scored_at" | "created_at">,
): Promise<TopicRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;
    const { data: row, error } = await supabase
      .from("topics")
      .insert(data)
      .select()
      .single();

    if (error || !row) return null;
    return row as TopicRow;
  } catch {
    return null;
  }
}

export async function updateTopic(
  id: string,
  data: Partial<Omit<TopicRow, "id" | "created_at">>,
): Promise<TopicRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;
    const { data: row, error } = await supabase
      .from("topics")
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error || !row) return null;
    return row as TopicRow;
  } catch {
    return null;
  }
}

export async function deleteTopic(id: string): Promise<boolean> {
  const clientP = getServerClient();
  if (!clientP) return false;

  try {
    const supabase = await clientP;
    const { error } = await supabase
      .from("topics")
      .update({ is_active: false })
      .eq("id", id);

    return !error;
  } catch {
    return false;
  }
}

export async function createFeed(
  topicId: string,
  name: string,
  url: string,
): Promise<FeedRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;
    const { data: row, error } = await supabase
      .from("feeds")
      .insert({ topic_id: topicId, name, url })
      .select()
      .single();

    if (error || !row) return null;
    return row as FeedRow;
  } catch {
    return null;
  }
}

export async function updateFeed(
  feedId: number,
  data: Partial<Pick<FeedRow, "name" | "url" | "is_active">>,
): Promise<FeedRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;
    const { data: row, error } = await supabase
      .from("feeds")
      .update(data)
      .eq("id", feedId)
      .select()
      .single();

    if (error || !row) return null;
    return row as FeedRow;
  } catch {
    return null;
  }
}

export async function deleteFeed(feedId: number): Promise<boolean> {
  const clientP = getServerClient();
  if (!clientP) return false;

  try {
    const supabase = await clientP;
    const { error } = await supabase.from("feeds").delete().eq("id", feedId);
    return !error;
  } catch {
    return false;
  }
}

export async function getFeedById(feedId: number): Promise<FeedRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("feeds")
      .select("*")
      .eq("id", feedId)
      .single();

    if (error || !data) return null;
    return data as FeedRow;
  } catch {
    return null;
  }
}

export async function deleteArticlesByTopicAndSource(
  topicId: string,
  source: string,
): Promise<{ ok: boolean; deleted: number }> {
  const clientP = getServerClient();
  if (!clientP) return { ok: false, deleted: 0 };

  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("articles")
      .delete()
      .eq("topic", topicId)
      .eq("source", source)
      .select("id");

    if (error) return { ok: false, deleted: 0 };
    return { ok: true, deleted: data?.length ?? 0 };
  } catch {
    return { ok: false, deleted: 0 };
  }
}

export async function getAllFeedsRows(): Promise<FeedRow[]> {
  const clientP = getServerClient();
  if (!clientP) return [];

  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("feeds")
      .select("*")
      .order("topic_id", { ascending: true })
      .order("name", { ascending: true });

    if (error || !data) return [];
    return data as FeedRow[];
  } catch {
    return [];
  }
}

export async function getTopicPrompt(
  id: string,
): Promise<{ prompt_en: string; prompt_fr: string } | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("topics")
      .select("prompt_en, prompt_fr")
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (error || !data) return null;
    return data as { prompt_en: string; prompt_fr: string };
  } catch {
    return null;
  }
}

// ── Articles from BDD ──────────────────────────────────────────────────

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

// ── User Topic Preferences ─────────────────────────────────────────────

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

// ── User Favorites ──────────────────────────────────────────────────────

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

// ── Daily Summaries (SEO) ───────────────────────────────────────────────

export interface DailySummaryRow {
  id: number;
  topic_id: string;
  summary_date: string;
  lang: string;
  slug_keywords: string;
  bullets: unknown;
  articles: unknown;
  meta: unknown;
  seo_title: string;
  seo_description: string;
  seo_h1: string;
  period_from: string;
  period_to: string;
  created_at: string;
}

export async function getDailySummary(
  topicId: string,
  date: string,
  lang: string,
): Promise<DailySummaryRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("daily_summaries")
      .select("*")
      .eq("topic_id", topicId)
      .eq("summary_date", date)
      .eq("lang", lang)
      .single();
    if (error || !data) return null;
    return data as DailySummaryRow;
  } catch {
    return null;
  }
}

export async function getDailySummaryBySlug(
  topicId: string,
  date: string,
  slug: string,
): Promise<DailySummaryRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("daily_summaries")
      .select("*")
      .eq("topic_id", topicId)
      .eq("summary_date", date)
      .eq("slug_keywords", slug)
      .single();
    if (error || !data) return null;
    return data as DailySummaryRow;
  } catch {
    return null;
  }
}

export async function listDailySummaries(
  topicId: string,
  lang: string,
  page: number,
  limit: number,
): Promise<{ rows: DailySummaryRow[]; total: number }> {
  const clientP = getServerClient();
  if (!clientP) return { rows: [], total: 0 };
  try {
    const supabase = await clientP;
    const offset = (page - 1) * limit;
    const [{ data, error }, { count }] = await Promise.all([
      supabase
        .from("daily_summaries")
        .select("*")
        .eq("topic_id", topicId)
        .eq("lang", lang)
        .order("summary_date", { ascending: false })
        .range(offset, offset + limit - 1),
      supabase
        .from("daily_summaries")
        .select("id", { count: "exact", head: true })
        .eq("topic_id", topicId)
        .eq("lang", lang),
    ]);
    if (error || !data) return { rows: [], total: count ?? 0 };
    return { rows: data as DailySummaryRow[], total: count ?? 0 };
  } catch {
    return { rows: [], total: 0 };
  }
}

export async function insertDailySummary(row: {
  topic_id: string;
  summary_date: string;
  lang: string;
  slug_keywords: string;
  bullets: unknown;
  articles: unknown;
  meta: unknown;
  seo_title: string;
  seo_description: string;
  seo_h1: string;
  period_from: string;
  period_to: string;
}): Promise<number | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("daily_summaries")
      .upsert(row, { onConflict: "topic_id,summary_date,lang" })
      .select("id")
      .single();
    if (error || !data) return null;
    return (data as { id: number }).id;
  } catch {
    return null;
  }
}

export async function insertSummaryBullets(
  bullets: Array<{
    daily_summary_id: number;
    topic_id: string;
    lang: string;
    summary_date: string;
    bullet_index: number;
    text: string;
    refs: unknown;
    entities: string[];
  }>,
): Promise<boolean> {
  if (bullets.length === 0) return true;
  const clientP = getServerClient();
  if (!clientP) return false;
  try {
    const supabase = await clientP;
    await supabase
      .from("summary_bullets")
      .delete()
      .eq("daily_summary_id", bullets[0].daily_summary_id);
    const { error } = await supabase.from("summary_bullets").insert(bullets);
    return !error;
  } catch {
    return false;
  }
}

/** Days kept in the sitemap. Older URLs are still served and crawlable
 *  via internal links, just no longer advertised explicitly to keep the
 *  sitemap under Google's 50K-URL/file ceiling. See plan default #6. */
const SITEMAP_RECENT_DAYS = 90;

export async function getAllSummaryRoutes(): Promise<
  Array<{ topic_id: string; summary_date: string; slug_keywords: string; lang: string }>
> {
  const clientP = getServerClient();
  if (!clientP) return [];
  try {
    const supabase = await clientP;
    const sinceISO = new Date(Date.now() - SITEMAP_RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("daily_summaries")
      .select("topic_id, summary_date, slug_keywords, lang")
      .gte("summary_date", sinceISO)
      .order("summary_date", { ascending: false });
    if (error || !data) return [];
    return data as Array<{ topic_id: string; summary_date: string; slug_keywords: string; lang: string }>;
  } catch {
    return [];
  }
}

/**
 * Last-{@link SITEMAP_RECENT_DAYS} days of per-video SSR pages. Same
 * shape as `getAllSummaryRoutes` so the sitemap.ts can map both with
 * the same code path. Excludes rows missing topic_id or slug — those
 * have no SSR page (see backfill in scripts/backfill-video-slugs.mjs).
 */
export async function getAllVideoPageRoutes(): Promise<
  Array<{ topic_id: string; published_date: string; slug_keywords: string; lang: string }>
> {
  const clientP = getServerClient();
  if (!clientP) return [];
  try {
    const supabase = await clientP;
    const sinceISO = new Date(Date.now() - SITEMAP_RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("video_transcriptions")
      .select("topic_id, published_date, slug_keywords, lang")
      .gte("published_date", sinceISO)
      .not("topic_id", "is", null)
      .not("slug_keywords", "is", null)
      .order("published_date", { ascending: false });
    if (error || !data) return [];
    return data as Array<{ topic_id: string; published_date: string; slug_keywords: string; lang: string }>;
  } catch {
    return [];
  }
}

export async function getTopicById(
  id: string,
): Promise<{ id: string; label_en: string; label_fr: string; is_active: boolean } | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("topics")
      .select("id, label_en, label_fr, is_active")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return data as { id: string; label_en: string; label_fr: string; is_active: boolean };
  } catch {
    return null;
  }
}

/* ── Video transcription helpers ───────────────────────────────────── */

export async function getVideoTranscription(
  videoId: string,
  lang: string,
): Promise<{ id: number; summary_md: string; transcript: string; word_count: number | null } | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("video_transcriptions")
      .select("id, summary_md, transcript, word_count")
      .eq("video_id", videoId)
      .eq("lang", lang)
      .single();
    if (error || !data) return null;
    return data as { id: number; summary_md: string; transcript: string; word_count: number | null };
  } catch {
    return null;
  }
}

export async function insertVideoTranscription(row: {
  video_id: string;
  channel_id: string;
  title: string;
  lang: string;
  transcript: string;
  summary_md: string;
  word_count: number;
  topic_id?: string | null;
  /** Pre-computed slug (4-5 keywords). NULL until we know `topic_id` and
   * `published_date`, since the route /{topic}/v/{date}/{slug} needs all
   * three to resolve. Computed by `slugifyVideoTitle()` then made unique
   * by `uniquifyVideoSlug()` against the existing rows in the same bucket. */
  slug_keywords?: string | null;
  /** Date the video was published on YouTube (UTC date). Sourced from
   * `youtube_videos.published_date`. Joins the slug to form the URL
   * /{topic}/v/{date}/{slug}. */
  published_date?: string | null;
}): Promise<number | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("video_transcriptions")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) return null;
    return (data as { id: number }).id;
  } catch {
    return null;
  }
}

export async function insertVideoBullets(
  bullets: Array<{
    video_transcription_id: number;
    topic_id: string | null;
    lang: string;
    summary_date: string;
    bullet_index: number;
    text: string;
    refs: unknown[];
    source_type: string;
    entities: string[];
  }>,
): Promise<boolean> {
  if (bullets.length === 0) return true;
  const clientP = getServerClient();
  if (!clientP) return false;
  try {
    const supabase = await clientP;
    await supabase
      .from("summary_bullets")
      .delete()
      .eq("video_transcription_id", bullets[0].video_transcription_id);
    const { error } = await supabase.from("summary_bullets").insert(bullets);
    return !error;
  } catch {
    return false;
  }
}

/* ── Video roundups (per-topic-per-day SSR pages) ───────────────────── */

export interface VideoRoundupRow {
  id: number;
  topic_id: string;
  roundup_date: string;
  lang: string;
  slug_keywords: string;
  seo_title: string;
  seo_description: string | null;
  intro_md: string;
  video_ids: string[];
  created_at: string;
}

/**
 * Insert or update a video_roundups row. Idempotent: re-running the
 * generator on the same (topic, date, lang) replaces the previous row
 * in place — useful when the cron retries or when an admin manually
 * regenerates after a fix.
 */
export async function upsertVideoRoundup(row: {
  topic_id: string;
  roundup_date: string;
  lang: string;
  slug_keywords: string;
  seo_title: string;
  seo_description: string | null;
  intro_md: string;
  video_ids: string[];
}): Promise<VideoRoundupRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("video_roundups")
      .upsert(row, { onConflict: "topic_id,roundup_date,lang" })
      .select("*")
      .single();
    if (error || !data) return null;
    return data as VideoRoundupRow;
  } catch {
    return null;
  }
}

/**
 * Lookup a roundup by its public route (topic + date + slug). Lang is
 * not in the filter for the same reason as `getVideoPageBySlug`: the
 * slug is per-lang and uniquely identifies the row.
 */
export async function getVideoRoundupBySlug(
  topicId: string,
  date: string,
  slug: string,
): Promise<VideoRoundupRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("video_roundups")
      .select("*")
      .eq("topic_id", topicId)
      .eq("roundup_date", date)
      .eq("slug_keywords", slug)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as VideoRoundupRow;
  } catch {
    return null;
  }
}

/**
 * Pull the alternate-language roundup for a given (topic, date). Used by
 * the SSR `/r/` page to render hreflang.
 */
export async function getVideoRoundupAltLang(
  topicId: string,
  date: string,
  currentLang: string,
): Promise<{ slug_keywords: string; lang: string } | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  const otherLang = currentLang === "fr" ? "en" : "fr";
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("video_roundups")
      .select("slug_keywords, lang")
      .eq("topic_id", topicId)
      .eq("roundup_date", date)
      .eq("lang", otherLang)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as { slug_keywords: string; lang: string };
  } catch {
    return null;
  }
}

/**
 * All transcribed videos with a slug for a (topic, date-range, lang)
 * bucket, ordered by created_at ascending. Drives the roundup generator
 * (collects the source material — the cron passes a 48 h window).
 *
 * The window is inclusive on both bounds and matches on `published_date`
 * (a DATE column), so passing the same value for both bounds yields the
 * legacy single-day behaviour. The SSR `/r/` page does NOT call this —
 * it fetches by the persisted `video_ids` array via
 * {@link getVideoTranscriptionsByIds} so it stays correct regardless of
 * how wide the generator's window was at write-time.
 */
export async function getVideoTranscriptionsForRoundup(
  topicId: string,
  fromDate: string,
  toDate: string,
  lang: string,
): Promise<Array<{
  id: number;
  video_id: string;
  title: string;
  summary_md: string;
  slug_keywords: string;
  channel_id: string;
}>> {
  const clientP = getServerClient();
  if (!clientP) return [];
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("video_transcriptions")
      .select("id, video_id, title, summary_md, slug_keywords, channel_id")
      .eq("topic_id", topicId)
      .gte("published_date", fromDate)
      .lte("published_date", toDate)
      .eq("lang", lang)
      .not("slug_keywords", "is", null)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data as Array<{
      id: number;
      video_id: string;
      title: string;
      summary_md: string;
      slug_keywords: string;
      channel_id: string;
    }>;
  } catch {
    return [];
  }
}

/**
 * Hydrate the exact list of `video_transcriptions` referenced by a
 * persisted roundup's `video_ids` array. Used by the SSR `/r/` page
 * which needs to render every video that was bundled into the briefing,
 * regardless of its `published_date` (the cron pulls a 48 h window so
 * a roundup keyed to date X may include videos from X-1).
 *
 * No `topic_id` / `published_date` filter on purpose — the IDs ARE the
 * source of truth. Lang is still filtered because `(video_id, lang)` is
 * the row's natural key in `video_transcriptions`.
 */
export async function getVideoTranscriptionsByIds(
  videoIds: string[],
  lang: string,
): Promise<Array<{
  id: number;
  video_id: string;
  title: string;
  summary_md: string;
  slug_keywords: string;
  channel_id: string;
  published_date: string | null;
}>> {
  if (videoIds.length === 0) return [];
  const clientP = getServerClient();
  if (!clientP) return [];
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("video_transcriptions")
      .select("id, video_id, title, summary_md, slug_keywords, channel_id, published_date")
      .in("video_id", videoIds)
      .eq("lang", lang);
    if (error || !data) return [];
    return data as Array<{
      id: number;
      video_id: string;
      title: string;
      summary_md: string;
      slug_keywords: string;
      channel_id: string;
      published_date: string | null;
    }>;
  } catch {
    return [];
  }
}

/**
 * Last N video roundups for a topic + lang. Used by the SSR `/r/` page
 * for the "previous roundups" sidebar block, and by the topic hub
 * (Phase 4) for the "video coverage" section.
 */
export async function getRecentVideoRoundups(
  topicId: string,
  lang: string,
  limit: number,
  excludeDate?: string,
): Promise<Array<{ roundup_date: string; slug_keywords: string; seo_title: string }>> {
  const clientP = getServerClient();
  if (!clientP) return [];
  try {
    const supabase = await clientP;
    let q = supabase
      .from("video_roundups")
      .select("roundup_date, slug_keywords, seo_title")
      .eq("topic_id", topicId)
      .eq("lang", lang)
      .order("roundup_date", { ascending: false })
      .limit(limit);
    if (excludeDate) q = q.neq("roundup_date", excludeDate);
    const { data, error } = await q;
    if (error || !data) return [];
    return data as Array<{ roundup_date: string; slug_keywords: string; seo_title: string }>;
  } catch {
    return [];
  }
}

/**
 * All video roundup routes from the last {@link SITEMAP_RECENT_DAYS}
 * days. Same shape as `getAllVideoPageRoutes`. Drives the sitemap.
 */
export async function getAllVideoRoundupRoutes(): Promise<
  Array<{ topic_id: string; roundup_date: string; slug_keywords: string; lang: string }>
> {
  const clientP = getServerClient();
  if (!clientP) return [];
  try {
    const supabase = await clientP;
    const sinceISO = new Date(Date.now() - SITEMAP_RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("video_roundups")
      .select("topic_id, roundup_date, slug_keywords, lang")
      .gte("roundup_date", sinceISO)
      .order("roundup_date", { ascending: false });
    if (error || !data) return [];
    return data as Array<{ topic_id: string; roundup_date: string; slug_keywords: string; lang: string }>;
  } catch {
    return [];
  }
}

/**
 * Look up the per-video SSR page row by its (topic, date, slug) tuple.
 *
 * Joins `video_transcriptions` with `youtube_videos` so the route gets
 * everything it needs in a single roundtrip: the AI summary + raw
 * transcript on one side, the YouTube metadata (thumbnail, duration,
 * channel title, link, view count) on the other.
 *
 * Lang is intentionally NOT a query filter: the slug is per-lang, so
 * a `(topic_id, published_date, slug_keywords)` triple matches at most
 * one row, and the lang is read from the returned row. See default #3
 * in the plan.
 *
 * Returns `null` when the route doesn't exist (slug typo, deleted row).
 */
export async function getVideoPageBySlug(
  topicId: string,
  date: string,
  slug: string,
): Promise<{
  id: number;
  video_id: string;
  channel_id: string;
  title: string;
  lang: string;
  summary_md: string;
  transcript: string;
  word_count: number | null;
  topic_id: string;
  published_date: string;
  slug_keywords: string;
  created_at: string;
  video: {
    title: string;
    description: string | null;
    channel_title: string;
    published: string;
    thumbnail: string | null;
    view_count: string | null;
    duration_sec: number | null;
    link: string;
  } | null;
} | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("video_transcriptions")
      .select(
        "id, video_id, channel_id, title, lang, summary_md, transcript, word_count, topic_id, published_date, slug_keywords, created_at",
      )
      .eq("topic_id", topicId)
      .eq("published_date", date)
      .eq("slug_keywords", slug)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;

    const row = data as {
      id: number; video_id: string; channel_id: string; title: string;
      lang: string; summary_md: string; transcript: string;
      word_count: number | null; topic_id: string; published_date: string;
      slug_keywords: string; created_at: string;
    };

    // Pull the YouTube cache row in a separate query — keeps the typing
    // straightforward and the join is anyway 1-1 by `video_id`.
    const { data: vidRow } = await supabase
      .from("youtube_videos")
      .select("title, description, channel_title, published, thumbnail, view_count, duration_sec, link")
      .eq("video_id", row.video_id)
      .limit(1)
      .maybeSingle();

    return {
      ...row,
      video: (vidRow as {
        title: string; description: string | null; channel_title: string;
        published: string; thumbnail: string | null; view_count: string | null;
        duration_sec: number | null; link: string;
      } | null) ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Latest N video pages for a given topic + lang. Used by the SSR
 * `/{topic}/v/{date}/{slug}` page for the "Sur le même sujet" sidebar.
 *
 * Filters by lang here (unlike the slug lookup) because we want all
 * featured items in the visitor's current language.
 *
 * Excludes the current video by `excludeVideoId` so we don't recommend
 * the page that's already being viewed.
 */
export async function getRecentVideoPagesForTopic(
  topicId: string,
  lang: string,
  limit: number,
  excludeVideoId?: string,
): Promise<Array<{ video_id: string; title: string; published_date: string; slug_keywords: string }>> {
  const clientP = getServerClient();
  if (!clientP) return [];
  try {
    const supabase = await clientP;
    let q = supabase
      .from("video_transcriptions")
      .select("video_id, title, published_date, slug_keywords")
      .eq("topic_id", topicId)
      .eq("lang", lang)
      .not("slug_keywords", "is", null)
      .not("published_date", "is", null)
      .order("published_date", { ascending: false })
      .limit(limit);
    if (excludeVideoId) q = q.neq("video_id", excludeVideoId);
    const { data, error } = await q;
    if (error || !data) return [];
    return data as Array<{ video_id: string; title: string; published_date: string; slug_keywords: string }>;
  } catch {
    return [];
  }
}

/**
 * Fetch the alternate-language version of a video page (same `video_id`,
 * other `lang`). Returns its slug + published_date so the route can
 * build the hreflang URL `/{topic}/v/{date}/{slug-other-lang}`.
 *
 * Returns null when the translation doesn't exist (the video was only
 * transcribed in one language so far).
 */
export async function getVideoPageAltLang(
  videoId: string,
  currentLang: string,
): Promise<{ topic_id: string; published_date: string; slug_keywords: string; lang: string } | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  const otherLang = currentLang === "fr" ? "en" : "fr";
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("video_transcriptions")
      .select("topic_id, published_date, slug_keywords, lang")
      .eq("video_id", videoId)
      .eq("lang", otherLang)
      .not("slug_keywords", "is", null)
      .not("published_date", "is", null)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as { topic_id: string; published_date: string; slug_keywords: string; lang: string };
  } catch {
    return null;
  }
}

export async function getVideoTranscriptionText(
  videoId: string,
  lang: string,
): Promise<string | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("video_transcriptions")
      .select("summary_md")
      .eq("video_id", videoId)
      .eq("lang", lang)
      .single();
    if (error || !data) return null;
    return (data as { summary_md: string }).summary_md;
  } catch {
    return null;
  }
}

export async function getVideoIdsWithTranscription(
  videoIds: string[],
  lang: string,
): Promise<Set<string>> {
  if (videoIds.length === 0) return new Set();
  const clientP = getServerClient();
  if (!clientP) return new Set();
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("video_transcriptions")
      .select("video_id")
      .in("video_id", videoIds)
      .eq("lang", lang);
    if (error || !data) return new Set();
    return new Set((data as { video_id: string }[]).map((r) => r.video_id));
  } catch {
    return new Set();
  }
}

/**
 * Persist the 8 structured bullets emitted by `generateVideoRoundup`
 * into `summary_bullets`. Same delete-then-insert cycle as the video
 * transcription path (migration 014) so re-running a roundup keeps the
 * per-bullet rows strictly in sync with `video_roundups.intro_md`.
 *
 * The `text` field stores `**Title**\n\nBody` Markdown so any consumer
 * (TTS, search index, RSS) can render or strip it the same way as the
 * other source_types.
 */
export async function insertVideoRoundupBullets(
  bullets: Array<{
    video_roundup_id: number;
    topic_id: string;
    lang: string;
    summary_date: string;
    bullet_index: number;
    text: string;
    source_type: string;
    entities: string[];
  }>,
): Promise<boolean> {
  if (bullets.length === 0) return true;
  const clientP = getServerClient();
  if (!clientP) return false;
  try {
    const supabase = await clientP;
    await supabase
      .from("summary_bullets")
      .delete()
      .eq("video_roundup_id", bullets[0].video_roundup_id);
    const { error } = await supabase.from("summary_bullets").insert(bullets);
    if (error) {
      // Detect the specific "column does not exist" case so the
      // operator gets a single, immediately actionable line in the
      // Netlify logs instead of a noisy ERROR every cron tick.
      // PostgREST surfaces missing columns as PGRST204 with a
      // message like:
      //   Could not find the 'video_roundup_id' column of
      //   'summary_bullets' in the schema cache
      const msg = error.message ?? "";
      const code = (error as { code?: string }).code ?? "";
      const isMissingColumn =
        code === "PGRST204" ||
        code === "42703" ||
        (msg.includes("video_roundup_id") && msg.includes("schema cache"));
      if (isMissingColumn) {
        console.warn(
          "[insertVideoRoundupBullets] skipped: summary_bullets.video_roundup_id is missing — " +
            "run migration 018-roundup-bullets.sql in Supabase to enable the bullets mirror " +
            "(roundup itself was persisted; mirror is non-fatal).",
        );
      } else {
        console.error("[insertVideoRoundupBullets] insert failed:", msg);
      }
      return false;
    }
    return true;
  } catch (err) {
    console.error("[insertVideoRoundupBullets] unexpected error:", err);
    return false;
  }
}

export async function insertTopSummaryBullets(
  lang: string,
  summaryDate: string,
  rows: Array<{
    topic_id: string | null;
    lang: string;
    summary_date: string;
    bullet_index: number;
    text: string;
    refs: unknown;
    source_type: string;
    entities: string[];
  }>,
): Promise<boolean> {
  if (rows.length === 0) return true;
  const clientP = getServerClient();
  if (!clientP) return false;
  try {
    const supabase = await clientP;
    await supabase
      .from("summary_bullets")
      .delete()
      .eq("source_type", "top50")
      .eq("lang", lang)
      .eq("summary_date", summaryDate);
    const { error } = await supabase.from("summary_bullets").insert(rows);
    return !error;
  } catch {
    return false;
  }
}

export async function getActiveTopicIds(): Promise<string[]> {
  const clientP = getServerClient();
  if (!clientP) return [];
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("topics")
      .select("id")
      .eq("is_active", true);
    if (error || !data) return [];
    return data.map((r) => r.id);
  } catch {
    return [];
  }
}
