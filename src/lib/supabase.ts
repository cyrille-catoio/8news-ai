import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getServerClient() {
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// TTL in minutes based on the requested time window
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
  const supabase = getServerClient();
  if (!supabase) return null;

  const ttl = getCacheTtlMinutes(hours);
  const cutoff = new Date(Date.now() - ttl * 60_000).toISOString();

  try {
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
    return data.response as CachedResponse;
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
  const supabase = getServerClient();
  if (!supabase) return;

  try {
    await supabase.from("news_cache").insert({
      topic,
      lang,
      hours,
      max_articles: maxArticles,
      response,
    });
  } catch {
    // Cache write failure is non-critical
  }
}

export async function cleanExpiredCache(): Promise<void> {
  const supabase = getServerClient();
  if (!supabase) return;

  try {
    const cutoff = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await supabase.from("news_cache").delete().lt("created_at", cutoff);
  } catch {
    // Cleanup failure is non-critical
  }
}
