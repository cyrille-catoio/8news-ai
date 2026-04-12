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

function getCacheTtlMinutes(hours: number): number {
  if (hours <= 1) return 5;
  if (hours <= 6) return 15;
  if (hours <= 24) return 30;
  return 60;
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

    return topics.map((t: Record<string, unknown>) => {
      const cat = t.categories as { label_en: string; label_fr: string } | null;
      const row = { ...t } as TopicRow;
      return {
        ...row,
        feed_count: countMap.get(row.id) ?? 0,
        category_label_en: cat?.label_en,
        category_label_fr: cat?.label_fr,
      };
    });
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
      .gte("relevance_score", minScore)
      .order("relevance_score", { ascending: false })
      .order("pub_date", { ascending: false })
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
): Promise<{ total: number; scored: number }> {
  const clientP = getServerClient();
  if (!clientP) return { total: 0, scored: 0 };

  try {
    const supabase = await clientP;
    const [totalRes, scoredRes] = await Promise.all([
      supabase
        .from("articles")
        .select("id", { count: "exact", head: true })
        .eq("topic", topic)
        .gte("pub_date", since),
      supabase
        .from("articles")
        .select("id", { count: "exact", head: true })
        .eq("topic", topic)
        .gte("pub_date", since)
        .not("relevance_score", "is", null),
    ]);
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
