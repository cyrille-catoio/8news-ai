import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * GET /api/video-pages/recent?date=2026-05-04&lang=fr
 * GET /api/video-pages/recent?page=0&lang=fr (legacy)
 *
 * Returns one calendar-day worth of transcribed-video SSR pages
 * (`/{topic}/v/{published_date}/{slug}`), ordered most-recent first.
 *
 *  - `date=YYYY-MM-DD` → that exact UTC calendar day
 *  - legacy `page=0` → today
 *  - legacy `page=1` → yesterday
 *  - legacy `page=2` → 2 days ago
 *  - …
 *
 * The response embeds `hasMore` so the client can disable the
 * « Plus ancien » button without making a second probe call.
 *
 * Powers the "Toutes les vidéos transcrites" block at the bottom of
 * the SPA Briefing homepage.
 */

const PAGE_SIZE_DAYS = 1;
const MAX_PAGE = 60;     // 60 calendar days back is plenty for SPA browsing
const DAY_MS = 86_400_000;
const DAY_ITEM_PAGE_SIZE = 1000;

interface VideoPageItem {
  videoId: string;
  title: string;
  topicId: string;
  publishedDate: string;
  slug: string;
  lang: string;
  /** AI quality score 1-10 from `cron-video-summary-score-background`, or `null` when unscored. */
  summaryScore: number | null;
}

interface PaginatedResponse {
  items: VideoPageItem[];
  page: number;
  pageSizeDays: number;
  fromDate: string;
  toDate: string;
  hasMore: boolean;
}

interface VideoPageRow {
  video_id: string;
  title: string;
  topic_id: string;
  published_date: string;
  slug_keywords: string;
  lang: string;
  created_at: string;
  summary_score: number | null;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseYmdDateUTC(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (ymd(d) !== value) return null;
  return d;
}

function clampUtcDay(d: Date, min: Date, max: Date): Date {
  if (d.getTime() < min.getTime()) return new Date(min);
  if (d.getTime() > max.getTime()) return new Date(max);
  return new Date(d);
}

/** PostgREST forwards the underlying Postgres error code. 42703 = undefined_column. */
function isMissingSummaryScoreColumn(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "42703") return true;
  return typeof e.message === "string" && /summary_score/i.test(e.message);
}

async function fetchAllVideoPageRowsForDay(
  db: SupabaseClient,
  lang: string,
  fromDate: string,
  toDate: string,
): Promise<{ data: VideoPageRow[] | null; error: unknown }> {
  const baseColumns = "video_id, title, topic_id, published_date, slug_keywords, lang, created_at";
  // Migration 021 adds summary_score on video_transcriptions. Tolerate its
  // absence so the list keeps rendering on an environment where the SQL
  // migration is pending — we'll retry without the column on `42703`.
  let columns = `${baseColumns}, summary_score`;
  let droppedScore = false;
  const rows: VideoPageRow[] = [];

  for (let start = 0; ; start += DAY_ITEM_PAGE_SIZE) {
    const end = start + DAY_ITEM_PAGE_SIZE - 1;
    const { data, error } = await db
      .from("video_transcriptions")
      .select(columns)
      .eq("lang", lang)
      .gte("published_date", fromDate)
      .lte("published_date", toDate)
      .not("topic_id", "is", null)
      .not("slug_keywords", "is", null)
      .order("published_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(start, end);

    if (error) {
      if (!droppedScore && isMissingSummaryScoreColumn(error)) {
        console.warn(
          "[/api/video-pages/recent] summary_score column missing — falling back. Apply migrations/021-video-summary-score.sql to enable AI quality scores in the list.",
        );
        columns = baseColumns;
        droppedScore = true;
        rows.length = 0;
        start = -DAY_ITEM_PAGE_SIZE; // restart from offset 0 on next iter
        continue;
      }
      return { data: null, error };
    }

    const page = ((data ?? []) as Array<Partial<VideoPageRow>>).map((row) => ({
      video_id: row.video_id ?? "",
      title: row.title ?? "",
      topic_id: row.topic_id ?? "",
      published_date: row.published_date ?? "",
      slug_keywords: row.slug_keywords ?? "",
      lang: row.lang ?? "",
      created_at: row.created_at ?? "",
      summary_score: typeof row.summary_score === "number" ? row.summary_score : null,
    })) as VideoPageRow[];
    rows.push(...page);

    if (page.length < DAY_ITEM_PAGE_SIZE) {
      return { data: rows, error: null };
    }
  }
}

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const langParam = req.nextUrl.searchParams.get("lang");
  const lang = langParam === "fr" ? "fr" : "en";

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const oldestAllowed = new Date(today);
  oldestAllowed.setUTCDate(oldestAllowed.getUTCDate() - MAX_PAGE);

  const explicitDate = parseYmdDateUTC(req.nextUrl.searchParams.get("date"));
  const pageParam = parseInt(req.nextUrl.searchParams.get("page") ?? "0", 10);
  const requestedPage = Math.min(MAX_PAGE, Math.max(0, isNaN(pageParam) ? 0 : pageParam));

  // `date` is preferred so the homepage controls exactly which day is shown.
  // `page` remains supported for older callers.
  const selectedDateD = explicitDate
    ? clampUtcDay(explicitDate, oldestAllowed, today)
    : new Date(today.getTime() - requestedPage * PAGE_SIZE_DAYS * DAY_MS);
  const page = Math.min(MAX_PAGE, Math.max(0, Math.round((today.getTime() - selectedDateD.getTime()) / DAY_MS)));
  const toDateD = new Date(selectedDateD);
  const fromDateD = new Date(selectedDateD);
  const fromDate = ymd(fromDateD);
  const toDate = ymd(toDateD);

  if (!url || !key) {
    const empty: PaginatedResponse = {
      items: [], page, pageSizeDays: PAGE_SIZE_DAYS, fromDate, toDate, hasMore: false,
    };
    return NextResponse.json(empty, { headers: { "Cache-Control": "no-store" } });
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  // Two queries in parallel:
  //  - the page itself (rows for [fromDate, toDate])
  //  - a probe for "anything older than fromDate" → hasMore boolean
  const olderProbeBound = ymd(new Date(fromDateD.getTime() - DAY_MS));
  const [pageRes, probeRes] = await Promise.all([
    fetchAllVideoPageRowsForDay(db, lang, fromDate, toDate),
    db
      .from("video_transcriptions")
      .select("video_id", { count: "exact", head: true })
      .eq("lang", lang)
      .lte("published_date", olderProbeBound)
      .not("topic_id", "is", null)
      .not("slug_keywords", "is", null)
      .limit(1),
  ]);

  if (pageRes.error) {
    const empty: PaginatedResponse = {
      items: [], page, pageSizeDays: PAGE_SIZE_DAYS, fromDate, toDate, hasMore: false,
    };
    return NextResponse.json(empty, { headers: { "Cache-Control": "no-store" } });
  }

  const items: VideoPageItem[] = (pageRes.data ?? []).map((row) => {
    const rawScore = row.summary_score;
    const score = typeof rawScore === "number" && rawScore >= 1 && rawScore <= 10
      ? rawScore
      : null;
    return {
      videoId: row.video_id,
      title: row.title,
      topicId: row.topic_id,
      publishedDate: row.published_date,
      slug: row.slug_keywords,
      lang: row.lang,
      summaryScore: score,
    };
  });

  const hasMore = page < MAX_PAGE && (probeRes.count ?? 0) > 0;

  const body: PaginatedResponse = {
    items,
    page,
    pageSizeDays: PAGE_SIZE_DAYS,
    fromDate,
    toDate,
    hasMore,
  };

  return NextResponse.json(body, {
    // Short edge cache: list refreshes whenever a new transcription
    // lands, but at most once a minute. Each (date, lang) combo gets
    // its own cache entry via Next.js automatic URL-based caching.
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
