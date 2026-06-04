import { getServerClient, SITEMAP_RECENT_DAYS } from "./client";

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
  /** RSS artwork when known at snapshot time (mig. 027+). */
  imageUrl?: string | null;
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

/**
 * Live home read (`offset=0`): prefer today's UTC row when it exists,
 * otherwise the newest row (yesterday until the daily cron lands).
 * `hasOlder` is true when any older edition exists for history arrows.
 */
export async function getTopSummaryLiveLatest(
  lang: "en" | "fr",
): Promise<{ snapshot: TopSummaryRow | null; hasOlder: boolean }> {
  const today = new Date().toISOString().slice(0, 10);
  const todaySnap = await getTopSummaryByDate(lang, today);
  if (todaySnap) {
    const { snapshot: older } = await getTopSummaryByOffset(lang, 1);
    return { snapshot: todaySnap, hasOlder: older !== null };
  }
  return getTopSummaryByOffset(lang, 0);
}

export async function getTopSummaryByOffset(
  lang: "en" | "fr",
  offset: number,
): Promise<{ snapshot: TopSummaryRow | null; hasOlder: boolean }> {
  const clientP = getServerClient();
  if (!clientP) return { snapshot: null, hasOlder: false };

  try {
    const supabase = await clientP;
    const safeOffset = Math.max(0, Math.floor(offset));
    const { data, error } = await supabase
      .from("top_summaries")
      .select("summary_date, lang, generated_at, model, articles, summary_md")
      .eq("lang", lang)
      .order("summary_date", { ascending: false })
      .range(safeOffset, safeOffset + 1);

    if (error || !data || data.length === 0) {
      return { snapshot: null, hasOlder: false };
    }

    return {
      snapshot: data[0] as TopSummaryRow,
      hasOlder: data.length > 1,
    };
  } catch {
    return { snapshot: null, hasOlder: false };
  }
}

/**
 * Fetch the snapshot for one specific (date, lang) tuple — drives the
 * SSR `/{YYYY-MM-DD}` page (v2.7.0+, the « top day » archive view
 * reachable from the gold box on `/archives`).
 *
 * Returns `null` when no row exists for that day in this lang. Same
 * column shape as `getLatestTopSummary` so the consumer can share
 * downstream rendering code (notably the article list + the markdown
 * payload that `Top24hHero` accordion-renders).
 */
export async function getTopSummaryByDate(
  lang: "en" | "fr",
  summaryDate: string,
): Promise<TopSummaryRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("top_summaries")
      .select("summary_date, lang, generated_at, model, articles, summary_md")
      .eq("lang", lang)
      .eq("summary_date", summaryDate)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data as TopSummaryRow;
  } catch {
    return null;
  }
}

/**
 * All `top_summaries` route triplets `(summary_date, lang)` from the
 * last `SITEMAP_RECENT_DAYS` (90) days — used by `sitemap.ts` to expose
 * `/{date}` URLs to crawlers. One row per (date, lang) — the SSR page
 * forks on `?lang=`, so each lang has its own canonical URL.
 *
 * The lighter shape (just the two columns the sitemap needs) keeps the
 * payload small even on large windows; the consumer maps each row to
 * one absolute URL.
 */
export async function getAllTopSummaryRoutes(): Promise<
  Array<{ summary_date: string; lang: "en" | "fr" }>
> {
  const clientP = getServerClient();
  if (!clientP) return [];

  try {
    const supabase = await clientP;
    const sinceISO = new Date(Date.now() - SITEMAP_RECENT_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const { data, error } = await supabase
      .from("top_summaries")
      .select("summary_date, lang")
      .gte("summary_date", sinceISO)
      .order("summary_date", { ascending: false });

    if (error || !data) return [];
    return data as Array<{ summary_date: string; lang: "en" | "fr" }>;
  } catch {
    return [];
  }
}

export interface TopSummaryBulletRow {
  bullet_index: number;
  title: string | null;
  text: string;
  refs: Array<{ title: string; link: string; source: string }>;
  /**
   * Editorial importance 1-10 for the GROUP this bullet belongs to
   * (mig. 026+). NULL on rows generated before the column existed and
   * on environments where mig. 026 hasn't been applied yet (the
   * SELECT below silently retries without the column on a 42703 / not
   * found error).
   */
  importance_score: number | null;
}

export async function getTopSummaryBulletsByDate(
  lang: "en" | "fr",
  summaryDate: string,
): Promise<TopSummaryBulletRow[]> {
  const clientP = getServerClient();
  if (!clientP) return [];

  try {
    const supabase = await clientP;
    // Migration 026 added `importance_score`. We first try to read it,
    // and fall back to the legacy column list when the database hasn't
    // been migrated yet — same defensive pattern as `title_localized`
    // in `videos.ts` and `summary_score` in `/api/video-pages/recent`.
    // Keeps the deploy hot-fix safe regardless of migration order.
    const fullColumns =
      "bullet_index, title, text, refs, importance_score";
    const baseColumns = "bullet_index, title, text, refs";
    const run = (columns: string) =>
      supabase
        .from("summary_bullets")
        .select(columns)
        .eq("source_type", "top50")
        .eq("lang", lang)
        .eq("summary_date", summaryDate)
        .order("bullet_index", { ascending: true });

    let res = await run(fullColumns);
    if (res.error && /importance_score/i.test(res.error.message ?? "")) {
      res = await run(baseColumns);
    }
    if (res.error || !res.data) return [];

    // The cron writes one row per (bullet, distinct topic) so a single
    // multi-topic bullet appears N times. Dedup by bullet_index keeping
    // the first occurrence — the title / text / refs / importance are
    // identical across the duplicates, only `topic_id` differs.
    const seen = new Set<number>();
    const out: TopSummaryBulletRow[] = [];
    const rows = res.data as unknown as Array<{
      bullet_index: number;
      title: string | null;
      text: string;
      refs: unknown;
      importance_score?: number | null;
    }>;
    for (const row of rows) {
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
        importance_score:
          typeof row.importance_score === "number" ? row.importance_score : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}
