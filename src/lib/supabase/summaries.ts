import { getServerClient, SITEMAP_RECENT_DAYS } from "./client";

/**
 * Daily summaries — the per-(topic, date, lang) editorial roundup
 * powering the SSR `/{topic}/s/{date}/{slug}` SEO pages and the
 * SPA's daily-summaries archive page. Persisted by
 * `cron-daily-summary-background` via `generateDailySummary` in
 * `src/lib/generate-daily-summary.ts`.
 *
 * `summary_bullets` mirror — the bullets array stored on the row is
 * also fanned out into `summary_bullets` with one row per bullet for
 * the SPA's per-bullet TTS audio + the favorites archive. The
 * insert-then-delete cycle in `insertSummaryBullets` keeps the mirror
 * strictly in sync with `daily_summaries.bullets`.
 */

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
  lang?: string,
): Promise<DailySummaryRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  try {
    const supabase = await clientP;
    let query = supabase
      .from("daily_summaries")
      .select("*")
      .eq("topic_id", topicId)
      .eq("summary_date", date)
      .eq("slug_keywords", slug);
    if (lang) query = query.eq("lang", lang);
    const { data, error } = await query
      .order("lang", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as DailySummaryRow;
  } catch {
    return null;
  }
}

export async function getDailySummariesBySlug(
  topicId: string,
  date: string,
  slug: string,
): Promise<DailySummaryRow[]> {
  const clientP = getServerClient();
  if (!clientP) return [];
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("daily_summaries")
      .select("*")
      .eq("topic_id", topicId)
      .eq("summary_date", date)
      .eq("slug_keywords", slug)
      .order("lang", { ascending: true });
    if (error || !data) return [];
    return data as DailySummaryRow[];
  } catch {
    return [];
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
