import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Lang } from "@/lib/i18n";
import { normalizeSummaryHeadings } from "@/lib/summary-headings";
import { getHiddenTopicIds } from "@/lib/supabase";
import { normalizeVideoScore } from "@/lib/score-format";
import { parseLang } from "@/lib/api-helpers";

/**
 * GET /api/videos/top?lang=fr
 *
 * Returns ONE transcribed YouTube video for the Briefing's
 * "TOP VIDEO · MAINTENANT" card. Backed by `home_surface_queue`
 * (migration 022): every video transcription scored ≥ 7 with topic /
 * slug / published_date set is inserted into the queue at scoring
 * time. The route scans queue candidates in round-robin order, hydrates
 * the backing video/transcription, keeps only YouTube publications from
 * the last 24h, then bumps `display_count` on the selected fresh row.
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
const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
const QUEUE_SCAN_BATCH_SIZE = 100;
const QUEUE_SCAN_MAX_ROWS = 1000;
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

function parseThreshold(raw: string | null | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(10, Math.max(1, n));
}

function jsonResponse(
  payload: TopVideoPayload,
  _bucket: number,
  _now: number,
): NextResponse {
  // Explicit no-store across all caching layers — see /api/news/top-story
  // for the rationale (Netlify edge cache was collapsing all `?offset=N`
  // URLs onto one entry by hashing the path only, which made the chevron
  // history appear broken in production).
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Netlify-CDN-Cache-Control": "no-store",
      Vary: "Cookie",
    },
  });
}

interface TranscriptionRow {
  id: number;
  video_id: string;
  summary_md: string | null;
  topic_id: string | null;
  slug_keywords: string | null;
  published_date: string | null;
  summary_score: number | null;
  /** Per-lang translated title (NULL for legacy rows; reader falls back to `youtube_videos.title`). */
  title_localized: string | null;
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

interface QueueRow {
  id: number;
  ref_id: number;
  display_count: number | null;
}

interface FreshVideoCandidate {
  queue: QueueRow;
  video: VideoTopItem;
}

function isFreshPublication(iso: string | null | undefined, now: number): boolean {
  if (!iso) return false;
  const publishedAt = new Date(iso).getTime();
  if (!Number.isFinite(publishedAt)) return false;
  return publishedAt <= now && now - publishedAt < FRESH_WINDOW_MS;
}

function toVideoTopItem(
  tr: TranscriptionRow,
  yv: YoutubeVideoRow,
  lang: Lang,
): VideoTopItem {
  const summaryMd = tr.summary_md
    ? normalizeSummaryHeadings(tr.summary_md, lang)
    : null;

  return {
    videoId: yv.video_id,
    title: tr.title_localized ?? yv.title,
    description: yv.description,
    channelTitle: yv.channel_title,
    channelId: yv.channel_id,
    published: yv.published,
    thumbnail: yv.thumbnail,
    viewCount: yv.view_count,
    durationSec: yv.duration_sec,
    link: yv.link,
    summaryMd,
    summaryScore: normalizeVideoScore(tr.summary_score),
    topicId: tr.topic_id,
    slugKeywords: tr.slug_keywords,
    publishedDate: tr.published_date,
  };
}

async function fetchTranscriptionsById(
  db: SupabaseClient,
  refIds: number[],
): Promise<Map<number, TranscriptionRow> | null> {
  // `title_localized` is added by migration 023; gracefully fall back to
  // the pre-023 column list if the env hasn't been migrated yet so the
  // home keeps rendering with the YouTube title.
  const fullColumns =
    "id, video_id, summary_md, topic_id, slug_keywords, published_date, summary_score, title_localized";
  const baseColumns =
    "id, video_id, summary_md, topic_id, slug_keywords, published_date, summary_score";
  const runTr = (columns: string) =>
    db
      .from("video_transcriptions")
      .select(columns)
      .in("id", refIds);

  let trRes = await runTr(fullColumns);
  if (trRes.error && /title_localized/i.test(trRes.error.message ?? "")) {
    trRes = await runTr(baseColumns);
  }
  if (trRes.error) {
    console.error(`[/api/videos/top] transcription SELECT error: ${trRes.error.message}`);
    return null;
  }

  const byId = new Map<number, TranscriptionRow>();
  for (const row of (trRes.data ?? []) as unknown as Array<Partial<TranscriptionRow> & {
    id: number;
    video_id: string;
    summary_md: string | null;
    topic_id: string | null;
    slug_keywords: string | null;
    published_date: string | null;
    summary_score: number | null;
  }>) {
    byId.set(row.id, {
      id: row.id,
      video_id: row.video_id,
      summary_md: row.summary_md,
      topic_id: row.topic_id,
      slug_keywords: row.slug_keywords,
      published_date: row.published_date,
      summary_score: row.summary_score,
      title_localized: row.title_localized ?? null,
    });
  }
  return byId;
}

async function getFreshVideoCandidates(
  db: SupabaseClient,
  {
    lang,
    threshold,
    hiddenTopics,
    now,
    mode,
    offset,
  }: {
    lang: Lang;
    threshold: number;
    hiddenTopics: string[];
    now: number;
    mode: "live" | "history";
    offset: number;
  },
): Promise<FreshVideoCandidate[]> {
  const cutoffIso = new Date(now - FRESH_WINDOW_MS).toISOString();
  const nowIso = new Date(now).toISOString();
  const fresh: FreshVideoCandidate[] = [];
  let scanned = 0;

  while (scanned < QUEUE_SCAN_MAX_ROWS && fresh.length < offset + 2) {
    const from = scanned;
    const to = Math.min(scanned + QUEUE_SCAN_BATCH_SIZE, QUEUE_SCAN_MAX_ROWS) - 1;
    let q = db
      .from("home_surface_queue")
      .select("id, ref_id, display_count")
      .eq("kind", "video")
      .eq("lang", lang)
      .gte("score", threshold);

    if (mode === "live") {
      q = q
        .order("display_count", { ascending: true })
        .order("last_displayed_at", { ascending: true, nullsFirst: true })
        .order("inserted_at", { ascending: false });
    } else {
      q = q
        .order("last_displayed_at", { ascending: false, nullsFirst: false })
        .order("inserted_at", { ascending: false });
    }

    if (hiddenTopics.length > 0) {
      q = q.not("topic_id", "in", `(${hiddenTopics.map((id) => `"${id}"`).join(",")})`);
    }

    const { data: queueData, error: queueErr } = await q.range(from, to);
    if (queueErr) {
      console.error(`[/api/videos/top] queue SELECT error: ${queueErr.message}`);
      return [];
    }

    const queueRows = (queueData ?? []) as QueueRow[];
    if (queueRows.length === 0) break;

    const refIds = queueRows.map((row) => row.ref_id);
    const transcriptionsById = await fetchTranscriptionsById(db, refIds);
    if (!transcriptionsById) return [];

    const videoIds = Array.from(new Set(
      Array.from(transcriptionsById.values()).map((row) => row.video_id),
    ));
    const { data: videoData, error: videoErr } = await db
      .from("youtube_videos")
      .select(
        "video_id, title, description, channel_title, channel_id, published, thumbnail, view_count, duration_sec, link",
      )
      .in("video_id", videoIds)
      .gte("published", cutoffIso)
      .lte("published", nowIso);

    if (videoErr) {
      console.error(`[/api/videos/top] fresh youtube_videos SELECT error: ${videoErr.message}`);
      return [];
    }

    const videoById = new Map<string, YoutubeVideoRow>();
    for (const row of (videoData ?? []) as YoutubeVideoRow[]) {
      videoById.set(row.video_id, row);
    }

    for (const queueRow of queueRows) {
      const tr = transcriptionsById.get(queueRow.ref_id);
      if (!tr) continue;
      const yv = videoById.get(tr.video_id);
      if (!yv) continue;
      fresh.push({ queue: queueRow, video: toVideoTopItem(tr, yv, lang) });
      if (fresh.length >= offset + 2) break;
    }

    if (queueRows.length < QUEUE_SCAN_BATCH_SIZE) break;
    scanned += queueRows.length;
  }

  return fresh.slice(offset, offset + 2);
}

async function markVideoDisplayed(db: SupabaseClient, queue: QueueRow, now: number): Promise<void> {
  const { error } = await db
    .from("home_surface_queue")
    .update({
      display_count: (queue.display_count ?? 0) + 1,
      last_displayed_at: new Date(now).toISOString(),
    })
    .eq("id", queue.id);

  if (error) {
    console.error(`[/api/videos/top] display_count update error: ${error.message}`);
  }
}

export async function GET(request: NextRequest) {
  const lang = parseLang(request.nextUrl.searchParams.get("lang"));
  const threshold = parseThreshold(
    request.cookies.get("homeMinScoreVideo")?.value,
    DEFAULT_MIN_SCORE,
  );
  // `offset=0` (or absent) → live mode (fresh pick + display_count++).
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
    if (
      cached
      && cached.bucket === bucket
      && isFreshPublication(cached.payload.video?.published, now)
    ) {
      return jsonResponse(cached.payload, bucket, now);
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const empty: TopVideoPayload = { video: null, hasOlder: false, offset };
    return jsonResponse(empty, bucket, now);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const hiddenTopics = await getHiddenTopicIds();

  if (isLive) {
    const candidates = await getFreshVideoCandidates(db, {
      lang,
      threshold,
      hiddenTopics,
      now,
      mode: "live",
      offset: 0,
    });
    const picked = candidates[0];
    if (!picked) {
      const empty: TopVideoPayload = { video: null, hasOlder: false, offset };
      return jsonResponse(empty, bucket, now);
    }

    await markVideoDisplayed(db, picked.queue, now);

    const payload: TopVideoPayload = {
      video: picked.video,
      hasOlder: candidates.length > 1,
      offset,
    };
    cache.set(cacheKey, { bucket, payload });
    return jsonResponse(payload, bucket, now);
  }

  // ── History mode (offset > 0) ──────────────────────────────
  // Same ordering rationale as /api/news/top-story: most-recently-
  // displayed first (= previous bucket's pick), then never-displayed
  // rows by insertion freshness. NULLS LAST keeps unshown candidates
  // accessible from the chevron browse. Offset is applied after the 24h
  // freshness filter, so chevrons never land on stale videos.
  const candidates = await getFreshVideoCandidates(db, {
    lang,
    threshold,
    hiddenTopics,
    now,
    mode: "history",
    offset,
  });

  if (candidates.length === 0) {
    const empty: TopVideoPayload = { video: null, hasOlder: false, offset };
    return jsonResponse(empty, bucket, now);
  }

  const payload: TopVideoPayload = {
    video: candidates[0].video,
    hasOlder: candidates.length > 1,
    offset,
  };
  return jsonResponse(payload, bucket, now);
}
