import { getServerClient } from "./client";

/**
 * Read/write helpers for the `top_summaries` table — the pre-computed
 * daily Top articles AI summary snapshot (see migration 025).
 *
 * Writers
 * -------
 *  - `upsertTopSummary` — used by `generateTopSummary` (cron + the
 *    legacy POST debug route). Idempotent on (summary_date, lang).
 *
 * Readers
 * -------
 *  - `getLatestTopSummary` — the GET endpoint feeds /top-articles with
 *    the latest available snapshot, regardless of whether today's cron
 *    has run yet. Falls back transparently to yesterday's row.
 *  - `getTopSummaryBulletsByDate` — pulls the per-bullet rows from
 *    `summary_bullets` (source_type='top50') for a given snapshot,
 *    ordered by bullet_index. Bullets are stored once per distinct
 *    topic referenced; this helper de-duplicates by `bullet_index` so
 *    the UI sees one row per bullet.
 */

export interface TopSummaryArticle {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  snippet: string;
  topic?: string;
  score?: number | null;
}

export interface TopSummaryRow {
  summary_date: string;
  lang: "en" | "fr";
  generated_at: string;
  model: string | null;
  articles: TopSummaryArticle[];
  summary_md: string;
}

export async function upsertTopSummary(params: {
  summaryDate: string;
  lang: "en" | "fr";
  model: string | null;
  articles: TopSummaryArticle[];
  summaryMd: string;
}): Promise<boolean> {
  const clientP = getServerClient();
  if (!clientP) return false;

  try {
    const supabase = await clientP;
    // Delete-then-insert keeps the (summary_date, lang) key unique
    // without depending on a Postgres `ON CONFLICT` clause whose
    // column-target syntax has bitten us in earlier migrations.
    await supabase
      .from("top_summaries")
      .delete()
      .eq("summary_date", params.summaryDate)
      .eq("lang", params.lang);

    const { error } = await supabase.from("top_summaries").insert({
      summary_date: params.summaryDate,
      lang: params.lang,
      generated_at: new Date().toISOString(),
      model: params.model,
      articles: params.articles as unknown,
      summary_md: params.summaryMd,
    });

    if (error) {
      console.error("[upsertTopSummary] insert failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[upsertTopSummary] unexpected error:", err);
    return false;
  }
}

export async function getLatestTopSummary(
  lang: "en" | "fr",
): Promise<TopSummaryRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("top_summaries")
      .select("summary_date, lang, generated_at, model, articles, summary_md")
      .eq("lang", lang)
      .order("summary_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data as TopSummaryRow;
  } catch {
    return null;
  }
}

export interface TopSummaryBulletRow {
  bullet_index: number;
  title: string | null;
  text: string;
  refs: Array<{ title: string; link: string; source: string }>;
}

export async function getTopSummaryBulletsByDate(
  lang: "en" | "fr",
  summaryDate: string,
): Promise<TopSummaryBulletRow[]> {
  const clientP = getServerClient();
  if (!clientP) return [];

  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("summary_bullets")
      .select("bullet_index, title, text, refs")
      .eq("source_type", "top50")
      .eq("lang", lang)
      .eq("summary_date", summaryDate)
      .order("bullet_index", { ascending: true });

    if (error || !data) return [];

    // The cron writes one row per (bullet, distinct topic) so a single
    // multi-topic bullet appears N times. Dedup by bullet_index keeping
    // the first occurrence — the title / text / refs are identical
    // across the duplicates, only `topic_id` differs.
    const seen = new Set<number>();
    const out: TopSummaryBulletRow[] = [];
    for (const row of data as Array<{
      bullet_index: number;
      title: string | null;
      text: string;
      refs: unknown;
    }>) {
      if (seen.has(row.bullet_index)) continue;
      seen.add(row.bullet_index);
      const refs = Array.isArray(row.refs)
        ? (row.refs as Array<{ title: string; link: string; source: string }>)
        : [];
      out.push({
        bullet_index: row.bullet_index,
        title: row.title,
        text: row.text,
        refs,
      });
    }
    return out;
  } catch {
    return [];
  }
}
