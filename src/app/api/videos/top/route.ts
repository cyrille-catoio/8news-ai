import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Lang } from "@/lib/i18n";
import { normalizeSummaryHeadings } from "@/lib/summary-headings";
import { getHiddenTopicIds } from "@/lib/supabase";

/**
 * GET /api/videos/top?lang=fr
 *
 * Returns ONE transcribed YouTube video for the Briefing's
 * "TOP VIDEO · MAINTENANT" card. Backed by `home_surface_queue`
 * (migration 022): every video transcription scored ≥ 7 with topic /
 * slug / published_date set is inserted into the queue at scoring
 * time, and the pick is the row with the lowest `display_count`
 * matching the visitor's threshold (`pick_home_surface()` bumps
 * display_count atomically).
 *
 * Per-user thresholds
 * -------------------
 * The visitor's `homeMinScoreVideo` cookie (default **8**, clamp 1..10)
 * filters which queue rows can be picked. Authenticated users have the
 * value mirrored into `auth.users.user_metadata.home_min_score_video`.
 *
 * Caching layers (preserved)
 * --------------------------
 * - Module-level cache `Map<key, { bucket, payload }>` keyed by
 *   `${lang}:${threshold}` so anonymous visitors share a hot entry
 *   while custom thresholds get their own slot.
 * - CDN: `Cache-Control: public, max-age=0, s-maxage=<remaining>,
 *   must-revalidate` aligned to the bucket flip, with `Vary: Cookie`.
 *
 * Returns `{ video: null }` when the queue is empty for the active
 * filter; the client hides the section in that case.
 *
 * Response shape mirrors `VideoListResponseItem` from
 * `src/app/api/youtube-channels/videos/route.ts`.
 */

const ROTATION_BUCKET_MS = 10 * 60 * 1000;
const DEFAULT_MIN_SCORE = 8;

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

const cache = new Map<string, CacheEntry>();

function parseLang(raw: string | null): Lang {
  return raw === "fr" ? "fr" : "en";
}

function parseThreshold(raw: string | null | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(10, Math.max(1, n));
}

function jsonResponse(payload: TopVideoPayload, bucket: number, now: number): NextResponse {
  const remainingMs = (bucket + 1) * ROTATION_BUCKET_MS - now;
  const remainingSec = Math.max(1, Math.floor(remainingMs / 1000));
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": `public, max-age=0, s-maxage=${remainingSec}, must-revalidate`,
      Vary: "Cookie",
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
  const threshold = parseThreshold(
    request.cookies.get("homeMinScoreVideo")?.value,
    DEFAULT_MIN_SCORE,
  );
  const now = Date.now();
  const bucket = Math.floor(now / ROTATION_BUCKET_MS);
  const cacheKey = `${lang}:${threshold}`;

  const cached = cache.get(cacheKey);
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
  const hiddenTopics = await getHiddenTopicIds();

  // Atomic SELECT + display_count++ via the SQL function from migration 022.
  // `p_excluded_topics` mirrors the operator-level hidden-topics list so a
  // freshly-hidden topic never surfaces, even if its rows are still queued.
  const { data: pickRows, error: pickErr } = await db.rpc("pick_home_surface", {
    p_kind: "video",
    p_lang: lang,
    p_min_score: threshold,
    p_excluded_topics: hiddenTopics,
  });

  if (pickErr) {
    console.error(`[/api/videos/top] pick_home_surface error: ${pickErr.message}`);
    const empty: TopVideoPayload = { video: null };
    return jsonResponse(empty, bucket, now);
  }

  const picked = Array.isArray(pickRows) && pickRows.length > 0
    ? (pickRows[0] as { id: number; ref_id: number; score: number })
    : null;

  if (!picked) {
    const empty: TopVideoPayload = { video: null };
    cache.set(cacheKey, { bucket, payload: empty });
    return jsonResponse(empty, bucket, now);
  }

  // Hydrate from video_transcriptions (the queue's ref_id is its `id`).
  const { data: trData, error: trError } = await db
    .from("video_transcriptions")
    .select("video_id, summary_md, topic_id, slug_keywords, published_date, summary_score")
    .eq("id", picked.ref_id)
    .limit(1);

  if (trError || !trData || trData.length === 0) {
    const empty: TopVideoPayload = { video: null };
    cache.set(cacheKey, { bucket, payload: empty });
    return jsonResponse(empty, bucket, now);
  }

  const tr = trData[0] as TranscriptionRow;

  // Card metadata from youtube_videos.
  const { data: yvData, error: yvError } = await db
    .from("youtube_videos")
    .select(
      "video_id, title, description, channel_title, channel_id, published, thumbnail, view_count, duration_sec, link",
    )
    .eq("video_id", tr.video_id)
    .limit(1);

  if (yvError || !yvData || yvData.length === 0) {
    const empty: TopVideoPayload = { video: null };
    cache.set(cacheKey, { bucket, payload: empty });
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
  cache.set(cacheKey, { bucket, payload });
  return jsonResponse(payload, bucket, now);
}
