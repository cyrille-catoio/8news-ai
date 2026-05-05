import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * GET /api/video-pages/recent?page=1&pageSize=10&lang=fr
 *
 * Classic offset/limit pagination over transcribed-video SSR pages
 * (`/{topic}/v/{published_date}/{slug}`), ordered by `published_date`
 * desc then `created_at` desc.
 *
 *  - `page` is **1-indexed** (defaults to 1, clamped to >= 1)
 *  - `pageSize` defaults to 10, clamped to [1, 50]
 *
 * Powers the "Toutes les vidéos transcrites" block at the bottom of
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
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Netlify-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
} as const;

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
  topic_id: string;
  published_date: string;
  slug_keywords: string;
  lang: string;
  created_at: string;
  summary_score: number | null;
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** PostgREST forwards the underlying Postgres error code. 42703 = undefined_column. */
function isMissingSummaryScoreColumn(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "42703") return true;
  return typeof e.message === "string" && /summary_score/i.test(e.message);
}

/**
 * Read one page of rows (offset/limit). Tolerates a missing
 * `summary_score` column (migration 021 pending) by retrying without
 * the column once.
 */
async function fetchPageRows(
  db: SupabaseClient,
  lang: string,
  fromIdx: number,
  toIdx: number,
): Promise<{ data: VideoPageRow[] | null; error: unknown }> {
  const baseColumns = "video_id, title, topic_id, published_date, slug_keywords, lang, created_at";
  const fullColumns = `${baseColumns}, summary_score`;

  const run = async (columns: string) =>
    db
      .from("video_transcriptions")
      .select(columns)
      .eq("lang", lang)
      .not("topic_id", "is", null)
      .not("slug_keywords", "is", null)
      .order("published_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(fromIdx, toIdx);

  let res = await run(fullColumns);
  if (res.error && isMissingSummaryScoreColumn(res.error)) {
    console.warn(
      "[/api/video-pages/recent] summary_score column missing — falling back. Apply migrations/021-video-summary-score.sql to enable AI quality scores in the list.",
    );
    res = await run(baseColumns);
  }

  if (res.error) return { data: null, error: res.error };

  const rows = ((res.data ?? []) as Array<Partial<VideoPageRow>>).map((row) => ({
    video_id: row.video_id ?? "",
    title: row.title ?? "",
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const langParam = req.nextUrl.searchParams.get("lang");
  const lang = langParam === "fr" ? "fr" : "en";

  const requestedPage = parsePositiveInt(req.nextUrl.searchParams.get("page"), 1);
  const requestedPageSize = parsePositiveInt(
    req.nextUrl.searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE,
  );
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize));

  if (!url || !key) {
    const empty: PaginatedResponse = {
      items: [], page: 1, pageSize, totalCount: 0, totalPages: 0,
    };
    return NextResponse.json(empty, { headers: NO_STORE_HEADERS });
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  // Count first so we can clamp `page` against `totalPages` before
  // running the page query — avoids requesting a range past the end.
  const { count: rawCount, error: countErr } = await db
    .from("video_transcriptions")
    .select("video_id", { count: "exact", head: true })
    .eq("lang", lang)
    .not("topic_id", "is", null)
    .not("slug_keywords", "is", null);

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
  const pageRes = await fetchPageRows(db, lang, fromIdx, toIdx);

  if (pageRes.error) {
    const empty: PaginatedResponse = {
      items: [], page, pageSize, totalCount, totalPages,
    };
    return NextResponse.json(empty, { headers: NO_STORE_HEADERS });
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

  const body: PaginatedResponse = {
    items,
    page,
    pageSize,
    totalCount,
    totalPages,
  };

  return NextResponse.json(body, { headers: NO_STORE_HEADERS });
}
