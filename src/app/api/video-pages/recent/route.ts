import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/video-pages/recent?page=0&lang=fr
 *
 * Returns one paginated 2-day chunk of transcribed-video SSR pages
 * (`/{topic}/v/{published_date}/{slug}`), ordered most-recent first.
 *
 *  - `page=0` → today + yesterday  (the default chunk on first render)
 *  - `page=1` → 2 and 3 days ago
 *  - `page=2` → 4 and 5 days ago
 *  - …
 *
 * The response embeds `hasMore` so the client can disable the
 * « Plus ancien » button without making a second probe call.
 *
 * Powers the "Toutes les vidéos transcrites" block at the bottom of
 * the SPA Briefing homepage.
 */

const PAGE_SIZE_DAYS = 2;
const MAX_PAGE = 30;     // 60 days back is more than enough for SPA browsing

interface VideoPageItem {
  videoId: string;
  title: string;
  topicId: string;
  publishedDate: string;
  slug: string;
  lang: string;
}

interface PaginatedResponse {
  items: VideoPageItem[];
  page: number;
  pageSizeDays: number;
  fromDate: string;
  toDate: string;
  hasMore: boolean;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const langParam = req.nextUrl.searchParams.get("lang");
  const lang = langParam === "fr" ? "fr" : "en";

  const pageParam = parseInt(req.nextUrl.searchParams.get("page") ?? "0", 10);
  const page = Math.min(MAX_PAGE, Math.max(0, isNaN(pageParam) ? 0 : pageParam));

  // page=0 → [today-1, today], page=1 → [today-3, today-2], etc.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const toDateD = new Date(today);
  toDateD.setUTCDate(toDateD.getUTCDate() - page * PAGE_SIZE_DAYS);
  const fromDateD = new Date(toDateD);
  fromDateD.setUTCDate(fromDateD.getUTCDate() - (PAGE_SIZE_DAYS - 1));
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
  const olderProbeBound = ymd(new Date(fromDateD.getTime() - 86_400_000));
  const [pageRes, probeRes] = await Promise.all([
    db
      .from("video_transcriptions")
      .select("video_id, title, topic_id, published_date, slug_keywords, lang, created_at")
      .eq("lang", lang)
      .gte("published_date", fromDate)
      .lte("published_date", toDate)
      .not("topic_id", "is", null)
      .not("slug_keywords", "is", null)
      .order("published_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
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

  const items: VideoPageItem[] = (pageRes.data ?? []).map((r) => {
    const row = r as {
      video_id: string;
      title: string;
      topic_id: string;
      published_date: string;
      slug_keywords: string;
      lang: string;
    };
    return {
      videoId: row.video_id,
      title: row.title,
      topicId: row.topic_id,
      publishedDate: row.published_date,
      slug: row.slug_keywords,
      lang: row.lang,
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
    // lands, but at most once a minute. Each (page, lang) combo gets
    // its own cache entry via Next.js automatic URL-based caching.
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
