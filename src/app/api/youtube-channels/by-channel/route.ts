import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/youtube-channels/by-channel?channelId=...&page=1&pageSize=10
 *
 * Paginated list of a single channel's cached videos (`youtube_videos`),
 * most recent first. Powers the channel drill-down in the « Chaînes
 * YouTube » browse page — classic offset/limit so the UI can lazy-load
 * 10 more on demand. `youtube_videos` is publicly readable, but we go
 * through the service key for a consistent server contract + clamping.
 *
 *  - `page` is 1-indexed (default 1)
 *  - `pageSize` defaults to 10, clamped to [1, 50]
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Netlify-CDN-Cache-Control": "no-store",
} as const;

export interface ChannelVideoItem {
  videoId: string;
  title: string;
  thumbnail: string | null;
  published: string;
  link: string;
  durationSec: number | null;
  viewCount: string | null;
  channelTitle: string;
  /** AI quality score 1-10 (best across langs) from `video_transcriptions`,
   *  or null when the recap is unscored / not transcribed. */
  summaryScore: number | null;
  /** Relative path to the on-site 8news per-video page
   *  (`/{topic}/v/{date}/{slug}`) when the video has been transcribed and
   *  has a topic + slug. `null` when no on-site page exists yet — the UI
   *  then falls back to the external YouTube `link`. */
  appUrl: string | null;
}

interface ChannelVideosResponse {
  items: ChannelVideoItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function empty(page: number, pageSize: number): ChannelVideosResponse {
  return { items: [], page, pageSize, totalCount: 0, totalPages: 0 };
}

export async function GET(req: NextRequest) {
  const channelId = req.nextUrl.searchParams.get("channelId")?.trim();
  const langParam = req.nextUrl.searchParams.get("lang");
  const uiLang = langParam === "fr" ? "fr" : "en";
  const requestedPage = parsePositiveInt(req.nextUrl.searchParams.get("page"), 1);
  const requestedPageSize = parsePositiveInt(
    req.nextUrl.searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE,
  );
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize));

  if (!channelId) {
    return NextResponse.json(
      { error: "channelId is required", ...empty(1, pageSize) },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(empty(1, pageSize), { headers: NO_STORE_HEADERS });
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  const { count: rawCount, error: countErr } = await db
    .from("youtube_videos")
    .select("video_id", { count: "exact", head: true })
    .eq("channel_id", channelId);

  if (countErr) {
    return NextResponse.json(empty(1, pageSize), { headers: NO_STORE_HEADERS });
  }

  const totalCount = rawCount ?? 0;
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(Math.max(1, requestedPage), totalPages);

  if (totalCount === 0) {
    return NextResponse.json(
      { items: [], page, pageSize, totalCount, totalPages },
      { headers: NO_STORE_HEADERS },
    );
  }

  const fromIdx = (page - 1) * pageSize;
  const toIdx = fromIdx + pageSize - 1;

  const { data, error } = await db
    .from("youtube_videos")
    .select("video_id, title, thumbnail, published, link, duration_sec, view_count, channel_title")
    .eq("channel_id", channelId)
    .order("published", { ascending: false })
    .range(fromIdx, toIdx);

  if (error || !data) {
    return NextResponse.json(
      { items: [], page, pageSize, totalCount, totalPages },
      { headers: NO_STORE_HEADERS },
    );
  }

  // Enrich from `video_transcriptions`:
  //  - `summaryScore`: best valid (1-10) score across langs, so the badge
  //    shows whenever a score exists.
  //  - `appUrl`: the on-site per-video page `/{topic}/v/{date}/{slug}`,
  //    preferring the UI-lang transcription and falling back to any lang
  //    that has a topic + slug + date.
  const pageVideoIds = data.map((r) => r.video_id as string);
  const scoreByVideoId = new Map<string, number>();
  const appUrlByVideoId = new Map<string, string>();
  // Track whether the chosen appUrl came from the UI lang so a later
  // UI-lang row can upgrade a fallback chosen from the other lang.
  const appUrlIsUiLang = new Map<string, boolean>();
  if (pageVideoIds.length > 0) {
    const { data: trows } = await db
      .from("video_transcriptions")
      .select("video_id, summary_score, topic_id, slug_keywords, published_date, lang")
      .in("video_id", pageVideoIds);
    for (const row of trows ?? []) {
      const id = row.video_id as string;
      const s = row.summary_score as number | null;
      if (typeof s === "number" && s >= 1 && s <= 10) {
        const prev = scoreByVideoId.get(id);
        if (prev == null || s > prev) scoreByVideoId.set(id, s);
      }
      const topicId = row.topic_id as string | null;
      const slug = row.slug_keywords as string | null;
      const date = row.published_date as string | null;
      const rowLang = row.lang as string;
      if (topicId && slug && date) {
        const isUi = rowLang === uiLang;
        // Prefer the UI-lang page; otherwise accept the first available.
        if (!appUrlByVideoId.has(id) || (isUi && !appUrlIsUiLang.get(id))) {
          appUrlByVideoId.set(id, `/${topicId}/v/${date}/${slug}`);
          appUrlIsUiLang.set(id, isUi);
        }
      }
    }
  }

  const items: ChannelVideoItem[] = data.map((r) => {
    const videoId = r.video_id as string;
    return {
      videoId,
      title: r.title as string,
      thumbnail: (r.thumbnail as string | null) ?? null,
      published: r.published as string,
      link: r.link as string,
      durationSec: (r.duration_sec as number | null) ?? null,
      viewCount: (r.view_count as string | null) ?? null,
      channelTitle: r.channel_title as string,
      summaryScore: scoreByVideoId.get(videoId) ?? null,
      appUrl: appUrlByVideoId.get(videoId) ?? null,
    };
  });

  const body: ChannelVideosResponse = { items, page, pageSize, totalCount, totalPages };
  return NextResponse.json(body, { headers: NO_STORE_HEADERS });
}
