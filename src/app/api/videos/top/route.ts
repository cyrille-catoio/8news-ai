import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Lang } from "@/lib/i18n";
import { normalizeSummaryHeadings } from "@/lib/summary-headings";

/**
 * GET /api/videos/top?lang=fr
 *
 * Returns ONE transcribed YouTube video suitable for the Briefing's
 * "TOP VIDEO · MAINTENANT" card. The pick is **synchronized across all
 * visitors** of the same language: every user hitting the page within
 * a given 10-minute wall-clock bucket sees the same video (FR users
 * see the FR top video, EN users see the EN top video).
 *
 * Strategy
 * --------
 * 1. Pull the most recent row from `video_transcriptions` matching:
 *      - `lang = ?`
 *      - `summary_score >= 8` (AI quality gate from migration 021)
 *      - `summary_md` non-empty
 *      - `topic_id`, `slug_keywords`, `published_date` all set (the
 *        SSR route /{topic}/v/{date}/{slug} can't exist without them)
 *    Ordered `published_date DESC, created_at DESC`, limit 1.
 * 2. Join with `youtube_videos` to surface the card metadata (title,
 *    thumbnail, channel, etc.).
 *
 * Caching layers — same shape as `/api/news/top-story`:
 * - **CDN** (`Cache-Control: public, max-age=0, s-maxage=<remaining>,
 *   must-revalidate`): the response is shared across all visitors of
 *   the same `?lang=` until the bucket flips.
 * - **Module-level cache** (per warm Netlify Function instance): a tiny
 *   `Map<Lang, { bucket, payload }>` skips the Supabase round-trip when
 *   the same instance handles multiple cache-miss requests in the same
 *   bucket.
 *
 * Returns `{ video: null }` when no recap meets the bar; the client
 * hides the section when that's the case.
 *
 * Response shape mirrors `VideoListResponseItem` from
 * `src/app/api/youtube-channels/videos/route.ts` so the SPA can render
 * the result through the same VideoCard pipeline as the rest of the
 * briefing.
 */

const ROTATION_BUCKET_MS = 10 * 60 * 1000;
const MIN_SCORE = 8;

interface VideoTopItem {
  videoId: string;
  title: string;
  description: string | null;
  channelTitle: string;
  channelId: string;
  published: string;
  thumbnail: string | null;
  viewCount: string | null;
  durationSec: number | null;
  link: string;
  summaryMd: string | null;
  summaryScore: number | null;
  topicId: string | null;
  slugKeywords: string | null;
  publishedDate: string | null;
}

interface TopVideoPayload {
  video: VideoTopItem | null;
}

interface CacheEntry {
  bucket: number;
  payload: TopVideoPayload;
}

const cache = new Map<Lang, CacheEntry>();

function parseLang(raw: string | null): Lang {
  return raw === "fr" ? "fr" : "en";
}

function jsonResponse(payload: TopVideoPayload, bucket: number, now: number): NextResponse {
  const remainingMs = (bucket + 1) * ROTATION_BUCKET_MS - now;
  const remainingSec = Math.max(1, Math.floor(remainingMs / 1000));
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": `public, max-age=0, s-maxage=${remainingSec}, must-revalidate`,
    },
  });
}

interface TranscriptionRow {
  video_id: string;
  summary_md: string | null;
  topic_id: string | null;
  slug_keywords: string | null;
  published_date: string | null;
  summary_score: number | null;
}

interface YoutubeVideoRow {
  video_id: string;
  title: string;
  description: string | null;
  channel_title: string;
  channel_id: string;
  published: string;
  thumbnail: string | null;
  view_count: string | null;
  duration_sec: number | null;
  link: string;
}

export async function GET(request: NextRequest) {
  const lang = parseLang(request.nextUrl.searchParams.get("lang"));
  const now = Date.now();
  const bucket = Math.floor(now / ROTATION_BUCKET_MS);

  const cached = cache.get(lang);
  if (cached && cached.bucket === bucket) {
    return jsonResponse(cached.payload, bucket, now);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const empty: TopVideoPayload = { video: null };
    return jsonResponse(empty, bucket, now);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: trData, error: trError } = await db
    .from("video_transcriptions")
    .select("video_id, summary_md, topic_id, slug_keywords, published_date, summary_score")
    .eq("lang", lang)
    .gte("summary_score", MIN_SCORE)
    .not("topic_id", "is", null)
    .not("slug_keywords", "is", null)
    .not("published_date", "is", null)
    .not("summary_md", "is", null)
    .neq("summary_md", "")
    .order("published_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (trError || !trData || trData.length === 0) {
    const empty: TopVideoPayload = { video: null };
    cache.set(lang, { bucket, payload: empty });
    return jsonResponse(empty, bucket, now);
  }

  const tr = trData[0] as TranscriptionRow;

  const { data: yvData, error: yvError } = await db
    .from("youtube_videos")
    .select(
      "video_id, title, description, channel_title, channel_id, published, thumbnail, view_count, duration_sec, link",
    )
    .eq("video_id", tr.video_id)
    .limit(1);

  if (yvError || !yvData || yvData.length === 0) {
    const empty: TopVideoPayload = { video: null };
    cache.set(lang, { bucket, payload: empty });
    return jsonResponse(empty, bucket, now);
  }

  const yv = yvData[0] as YoutubeVideoRow;

  const summaryMd = tr.summary_md
    ? normalizeSummaryHeadings(tr.summary_md, lang)
    : null;

  const video: VideoTopItem = {
    videoId: yv.video_id,
    title: yv.title,
    description: yv.description,
    channelTitle: yv.channel_title,
    channelId: yv.channel_id,
    published: yv.published,
    thumbnail: yv.thumbnail,
    viewCount: yv.view_count,
    durationSec: yv.duration_sec,
    link: yv.link,
    summaryMd,
    summaryScore: tr.summary_score,
    topicId: tr.topic_id,
    slugKeywords: tr.slug_keywords,
    publishedDate: tr.published_date,
  };

  const payload: TopVideoPayload = { video };
  cache.set(lang, { bucket, payload });
  return jsonResponse(payload, bucket, now);
}
