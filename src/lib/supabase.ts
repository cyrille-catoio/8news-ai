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
): Promise<TopArticleRow[]> {
  const clientP = getServerClient();
  if (!clientP) return [];

  try {
    const supabase = await clientP;
    let query = supabase
      .from("articles")
      .select("title, link, source, topic, pub_date, relevance_score, score_reason")
      .not("relevance_score", "is", null);

    if (topic && topic !== "all") query = query.eq("topic", topic);
    if (days > 0) {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      query = query.gte("pub_date", since);
    }

    const { data, error } = await query
      .order("relevance_score", { ascending: false })
      .order("pub_date", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data as TopArticleRow[];
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
  sort_order: number;
  last_fetched_at: string | null;
  last_scored_at: string | null;
  created_at: string;
}

export interface FeedRow {
  id: number;
  topic_id: string;
  name: string;
  url: string;
  is_active: boolean;
  created_at: string;
}

export async function getActiveTopics(includeInactive = false): Promise<
  (TopicRow & { feed_count: number })[]
> {
  const clientP = getServerClient();
  if (!clientP) return [];

  try {
    const supabase = await clientP;

    let query = supabase
      .from("topics")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (!includeInactive) query = query.eq("is_active", true);

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

    return (topics as TopicRow[]).map((t) => ({
      ...t,
      feed_count: countMap.get(t.id) ?? 0,
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
  data: Omit<TopicRow, "is_active" | "last_fetched_at" | "last_scored_at" | "created_at">,
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
      .order("pub_date", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data as DbArticle[];
  } catch {
    return [];
  }
}

