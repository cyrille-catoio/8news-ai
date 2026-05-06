import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
  /** Whether an older entry exists for this filter at `offset + 1`. */
  hasOlder: boolean;
  /** Echoes back the `offset` actually served (clamped to ≥0). */
  offset: number;
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

function jsonResponse(
  payload: TopVideoPayload,
  bucket: number,
  now: number,
  options?: { liveCache?: boolean },
): NextResponse {
  const remainingMs = (bucket + 1) * ROTATION_BUCKET_MS - now;
  const remainingSec = Math.max(1, Math.floor(remainingMs / 1000));
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": `public, max-age=0, s-maxage=${remainingSec}, must-revalidate`,
      Vary: "Cookie",
      "X-Live": options?.liveCache ? "1" : "0",
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

async function hydrateVideo(
  db: SupabaseClient,
  refId: number,
  lang: Lang,
): Promise<VideoTopItem | null> {
  const { data: trData, error: trError } = await db
    .from("video_transcriptions")
    .select("video_id, summary_md, topic_id, slug_keywords, published_date, summary_score")
    .eq("id", refId)
    .limit(1);
  if (trError || !trData || trData.length === 0) return null;
  const tr = trData[0] as TranscriptionRow;

  const { data: yvData, error: yvError } = await db
    .from("youtube_videos")
    .select(
      "video_id, title, description, channel_title, channel_id, published, thumbnail, view_count, duration_sec, link",
    )
    .eq("video_id", tr.video_id)
    .limit(1);
  if (yvError || !yvData || yvData.length === 0) return null;
  const yv = yvData[0] as YoutubeVideoRow;

  const summaryMd = tr.summary_md
    ? normalizeSummaryHeadings(tr.summary_md, lang)
    : null;

  return {
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
}

export async function GET(request: NextRequest) {
  const lang = parseLang(request.nextUrl.searchParams.get("lang"));
  const threshold = parseThreshold(
    request.cookies.get("homeMinScoreVideo")?.value,
    DEFAULT_MIN_SCORE,
  );
  // `offset=0` (or absent) → live mode (atomic pick + display_count++).
  // `offset>0` → history mode (read-only, ordered by last_displayed_at DESC).
  const offset = Math.max(
    0,
    Number.parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10) || 0,
  );
  const now = Date.now();
  const bucket = Math.floor(now / ROTATION_BUCKET_MS);
  const cacheKey = `${lang}:${threshold}:${offset}`;
  const isLive = offset === 0;

  if (isLive) {
    const cached = cache.get(cacheKey);
    if (cached && cached.bucket === bucket) {
      return jsonResponse(cached.payload, bucket, now, { liveCache: true });
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const empty: TopVideoPayload = { video: null, hasOlder: false, offset };
    return jsonResponse(empty, bucket, now, { liveCache: false });
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const hiddenTopics = await getHiddenTopicIds();

  if (isLive) {
    const { data: pickRows, error: pickErr } = await db.rpc("pick_home_surface", {
      p_kind: "video",
      p_lang: lang,
      p_min_score: threshold,
      p_excluded_topics: hiddenTopics,
    });

    if (pickErr) {
      console.error(`[/api/videos/top] pick_home_surface error: ${pickErr.message}`);
      const empty: TopVideoPayload = { video: null, hasOlder: false, offset };
      return jsonResponse(empty, bucket, now, { liveCache: false });
    }

    const picked = Array.isArray(pickRows) && pickRows.length > 0
      ? (pickRows[0] as { id: number; ref_id: number; score: number })
      : null;

    if (!picked) {
      const empty: TopVideoPayload = { video: null, hasOlder: false, offset };
      cache.set(cacheKey, { bucket, payload: empty });
      return jsonResponse(empty, bucket, now, { liveCache: true });
    }

    const video = await hydrateVideo(db, picked.ref_id, lang);
    if (!video) {
      const empty: TopVideoPayload = { video: null, hasOlder: false, offset };
      cache.set(cacheKey, { bucket, payload: empty });
      return jsonResponse(empty, bucket, now, { liveCache: true });
    }

    // Probe for at least one OTHER candidate row, including rows that
    // haven't been displayed yet — the chevron walks through the
    // rotation pool, not just the strict display history. Otherwise the
    // chevron stays disabled until the queue has cycled through 2+
    // distinct picks, which is rarely true right after a deploy.
    let countQ = db
      .from("home_surface_queue")
      .select("id", { count: "exact", head: true })
      .eq("kind", "video")
      .eq("lang", lang)
      .gte("score", threshold)
      .neq("ref_id", picked.ref_id);
    if (hiddenTopics.length > 0) {
      countQ = countQ.not("topic_id", "in", `(${hiddenTopics.map((id) => `"${id}"`).join(",")})`);
    }
    const { count: olderCount } = await countQ;
    const hasOlder = (olderCount ?? 0) > 0;

    const payload: TopVideoPayload = { video, hasOlder, offset };
    cache.set(cacheKey, { bucket, payload });
    return jsonResponse(payload, bucket, now, { liveCache: true });
  }

  // ── History mode (offset > 0) ──────────────────────────────
  // Same ordering rationale as /api/news/top-story: most-recently-
  // displayed first (= previous bucket's pick), then never-displayed
  // rows by insertion freshness. NULLS LAST keeps unshown candidates
  // accessible from the chevron browse.
  let q = db
    .from("home_surface_queue")
    .select("ref_id")
    .eq("kind", "video")
    .eq("lang", lang)
    .gte("score", threshold)
    .order("last_displayed_at", { ascending: false, nullsFirst: false })
    .order("inserted_at", { ascending: false })
    .range(offset, offset + 1);

  if (hiddenTopics.length > 0) {
    q = q.not("topic_id", "in", `(${hiddenTopics.map((id) => `"${id}"`).join(",")})`);
  }

  const { data: histRows, error: histErr } = await q;
  if (histErr) {
    console.error(`[/api/videos/top] history SELECT error: ${histErr.message}`);
    const empty: TopVideoPayload = { video: null, hasOlder: false, offset };
    return jsonResponse(empty, bucket, now, { liveCache: false });
  }
  const rows = (histRows ?? []) as Array<{ ref_id: number }>;
  if (rows.length === 0) {
    const empty: TopVideoPayload = { video: null, hasOlder: false, offset };
    return jsonResponse(empty, bucket, now, { liveCache: false });
  }

  const video = await hydrateVideo(db, rows[0].ref_id, lang);
  const hasOlder = rows.length > 1;
  const payload: TopVideoPayload = {
    video: video ?? null,
    hasOlder,
    offset,
  };
  return jsonResponse(payload, bucket, now, { liveCache: false });
}
