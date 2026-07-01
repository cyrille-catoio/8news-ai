import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerClient } from "@/lib/supabase";
import { normalizeVideoScore } from "@/lib/score-format";
import { NO_STORE_HEADERS, parseLang, parsePositiveInt } from "@/lib/api-helpers";

/**
 * GET /api/video-pages/recent?page=1&pageSize=10&lang=fr
 *
 * Transcribed-video SSR pages (`/{topic}/v/{published_date}/{slug}`)
 * **published in the last 24 hours**, ordered by AI quality
 * `summary_score` desc (NULLS LAST), then `published_date` desc, then
 * `created_at` desc — so the list runs from the highest score to the
 * lowest and page 1 holds the best recent recaps.
 *
 * The 24h window is computed against `youtube_videos.published`
 * (TIMESTAMPTZ, precise) rather than `video_transcriptions.published_date`
 * (DATE only): we first collect the `video_id`s published since the
 * cutoff, then filter/paginate the transcriptions to that set.
 *
 *  - `page` is **1-indexed** (defaults to 1, clamped to >= 1)
 *  - `pageSize` defaults to 10, clamped to [1, 50]
 *
 * Powers the "Top des vidéos transcrites · 24h" block at the bottom of
 * the SPA Briefing homepage.
 */

// Force dynamic execution: every request must re-run the handler so the
// `?page=` query string actually drives a fresh DB read. Netlify production
// has also shown path-level CDN reuse for this route when `s-maxage` is set,
// so every response below uses explicit no-store headers too.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
/** Rolling publication window for the home list: last 24 hours. */
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Safety cap on how many recent `video_id`s we feed into the `in()` filter. */
const MAX_RECENT_IDS = 1000;

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
  /** 1-indexed page number actually returned (clamped server-side). */
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

interface VideoPageRow {
  video_id: string;
  title: string;
  /** Per-lang translated title (migration 023). NULL on legacy rows. */
  title_localized: string | null;
  topic_id: string;
  published_date: string;
  slug_keywords: string;
  lang: string;
  created_at: string;
  summary_score: number | null;
}

/**
 * Collect the `video_id`s of YouTube videos published within the last
 * 24 hours. Uses the precise `published` TIMESTAMPTZ (not the DATE-only
 * `published_date`) so the window is a true rolling 24 h.
 */
async function fetchRecentVideoIds(
  db: SupabaseClient,
  cutoffIso: string,
): Promise<{ ids: string[] | null; error: unknown }> {
  const res = await db
    .from("youtube_videos")
    .select("video_id")
    .gte("published", cutoffIso)
    .order("published", { ascending: false })
    .limit(MAX_RECENT_IDS);

  if (res.error) return { ids: null, error: res.error };
  const ids = ((res.data ?? []) as Array<{ video_id: string | null }>)
    .map((r) => r.video_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  return { ids, error: null };
}

/** Read one page of rows (offset/limit) restricted to the recent video ids. */
async function fetchPageRows(
  db: SupabaseClient,
  lang: string,
  recentIds: string[],
  fromIdx: number,
  toIdx: number,
): Promise<{ data: VideoPageRow[] | null; error: unknown }> {
  // Ordering: highest AI quality score first (NULLS LAST so unscored
  // recaps sink to the bottom), then most recent. Applied globally so
  // every paginated slice walks from the top score down — each page is
  // sorted descending and page 1 holds the best recaps.
  const res = await db
    .from("video_transcriptions")
    .select(
      "video_id, title, title_localized, topic_id, published_date, slug_keywords, lang, created_at, summary_score",
    )
    .eq("lang", lang)
    .not("topic_id", "is", null)
    .not("slug_keywords", "is", null)
    .in("video_id", recentIds)
    .order("summary_score", { ascending: false, nullsFirst: false })
    .order("published_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(fromIdx, toIdx);

  if (res.error) return { data: null, error: res.error };

  const rows = ((res.data ?? []) as Array<Partial<VideoPageRow>>).map((row) => ({
    video_id: row.video_id ?? "",
    title: row.title ?? "",
    title_localized: row.title_localized ?? null,
    topic_id: row.topic_id ?? "",
    published_date: row.published_date ?? "",
    slug_keywords: row.slug_keywords ?? "",
    lang: row.lang ?? "",
    created_at: row.created_at ?? "",
    summary_score: typeof row.summary_score === "number" ? row.summary_score : null,
  }));
  return { data: rows, error: null };
}

export async function GET(req: NextRequest) {
  const lang = parseLang(req.nextUrl.searchParams.get("lang"));

  const requestedPage = parsePositiveInt(req.nextUrl.searchParams.get("page"), 1);
  const requestedPageSize = parsePositiveInt(
    req.nextUrl.searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE,
  );
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize));

  const dbP = getServerClient();
  if (!dbP) {
    const empty: PaginatedResponse = {
      items: [], page: 1, pageSize, totalCount: 0, totalPages: 0,
    };
    return NextResponse.json(empty, { headers: NO_STORE_HEADERS });
  }

  const db = await dbP;

  // Restrict to videos published in the last 24h (precise TIMESTAMPTZ).
  const cutoffIso = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
  const { ids: recentIds, error: recentErr } = await fetchRecentVideoIds(db, cutoffIso);

  if (recentErr || !recentIds || recentIds.length === 0) {
    const empty: PaginatedResponse = {
      items: [], page: 1, pageSize, totalCount: 0, totalPages: 0,
    };
    return NextResponse.json(empty, { headers: NO_STORE_HEADERS });
  }

  // Count first so we can clamp `page` against `totalPages` before
  // running the page query — avoids requesting a range past the end.
  const { count: rawCount, error: countErr } = await db
    .from("video_transcriptions")
    .select("video_id", { count: "exact", head: true })
    .eq("lang", lang)
    .not("topic_id", "is", null)
    .not("slug_keywords", "is", null)
    .in("video_id", recentIds);

  if (countErr) {
    const empty: PaginatedResponse = {
      items: [], page: 1, pageSize, totalCount: 0, totalPages: 0,
    };
    return NextResponse.json(empty, { headers: NO_STORE_HEADERS });
  }

  const totalCount = rawCount ?? 0;
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(Math.max(1, requestedPage), totalPages);

  if (totalCount === 0) {
    const empty: PaginatedResponse = {
      items: [], page, pageSize, totalCount, totalPages,
    };
    return NextResponse.json(empty, { headers: NO_STORE_HEADERS });
  }

  const fromIdx = (page - 1) * pageSize;
  const toIdx = fromIdx + pageSize - 1;
  const pageRes = await fetchPageRows(db, lang, recentIds, fromIdx, toIdx);

  if (pageRes.error) {
    const empty: PaginatedResponse = {
      items: [], page, pageSize, totalCount, totalPages,
    };
    return NextResponse.json(empty, { headers: NO_STORE_HEADERS });
  }

  const items: VideoPageItem[] = (pageRes.data ?? []).map((row) => {
    const score = normalizeVideoScore(row.summary_score);
    return {
      videoId: row.video_id,
      // Prefer the per-lang translated title (migration 023); fall back
      // to the YouTube title for legacy rows where translation never
      // ran.
      title: row.title_localized ?? row.title,
      topicId: row.topic_id,
      publishedDate: row.published_date,
      slug: row.slug_keywords,
      lang: row.lang,
      summaryScore: score,
    };
  });

  const body: PaginatedResponse = {
    items,
    page,
    pageSize,
    totalCount,
    totalPages,
  };

  return NextResponse.json(body, { headers: NO_STORE_HEADERS });
}
