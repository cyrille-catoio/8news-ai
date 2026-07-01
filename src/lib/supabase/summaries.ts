import { withClient, SITEMAP_RECENT_DAYS } from "./client";
import { toUtcDateString } from "@/lib/dates-utc";

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
  return withClient("getDailySummary", null, async (supabase) => {
    const { data, error } = await supabase
      .from("daily_summaries")
      .select("*")
      .eq("topic_id", topicId)
      .eq("summary_date", date)
      .eq("lang", lang)
      .single();
    if (error || !data) return null;
    return data as DailySummaryRow;
  });
}

export async function getDailySummaryBySlug(
  topicId: string,
  date: string,
  slug: string,
  lang?: string,
): Promise<DailySummaryRow | null> {
  return withClient("getDailySummaryBySlug", null, async (supabase) => {
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
  });
}

export async function getDailySummariesBySlug(
  topicId: string,
  date: string,
  slug: string,
): Promise<DailySummaryRow[]> {
  return withClient("getDailySummariesBySlug", [], async (supabase) => {
    const { data, error } = await supabase
      .from("daily_summaries")
      .select("*")
      .eq("topic_id", topicId)
      .eq("summary_date", date)
      .eq("slug_keywords", slug)
      .order("lang", { ascending: true });
    if (error || !data) return [];
    return data as DailySummaryRow[];
  });
}

export async function listDailySummaries(
  topicId: string,
  lang: string,
  page: number,
  limit: number,
): Promise<{ rows: DailySummaryRow[]; total: number }> {
  return withClient("listDailySummaries", { rows: [], total: 0 }, async (supabase) => {
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
  });
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
  return withClient("insertDailySummary", null, async (supabase) => {
    const { data, error } = await supabase
      .from("daily_summaries")
      .upsert(row, { onConflict: "topic_id,summary_date,lang" })
      .select("id")
      .single();
    if (error || !data) {
      if (error) console.error("[insertDailySummary] upsert failed:", error.message);
      return null;
    }
    return (data as { id: number }).id;
  }, "error");
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
    /** v2.10.3+ — passed explicitly as `'daily_summary'` by
     *  `generateDailySummary` instead of relying on the legacy DB
     *  default of `'article'`. The migration 032 backfill normalizes
     *  historical rows so the discriminator is now uniformly
     *  `'daily_summary'` for every daily SEO summary. */
    source_type?: string;
  }>,
): Promise<boolean> {
  if (bullets.length === 0) return true;
  return withClient("insertSummaryBullets", false, async (supabase) => {
    await supabase
      .from("summary_bullets")
      .delete()
      .eq("daily_summary_id", bullets[0].daily_summary_id);
    const { error } = await supabase.from("summary_bullets").insert(bullets);
    if (error) {
      console.error("[insertSummaryBullets] insert failed:", error.message);
      return false;
    }
    return true;
  }, "error");
}

export async function getAllSummaryRoutes(): Promise<
  Array<{ topic_id: string; summary_date: string; slug_keywords: string; lang: string }>
> {
  return withClient("getAllSummaryRoutes", [], async (supabase) => {
    const sinceISO = toUtcDateString(Date.now() - SITEMAP_RECENT_DAYS * 86_400_000);
    const { data, error } = await supabase
      .from("daily_summaries")
      .select("topic_id, summary_date, slug_keywords, lang")
      .gte("summary_date", sinceISO)
      .order("summary_date", { ascending: false });
    if (error || !data) return [];
    return data as Array<{ topic_id: string; summary_date: string; slug_keywords: string; lang: string }>;
  });
}
