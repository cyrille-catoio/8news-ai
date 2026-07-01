import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lang } from "@/lib/i18n";
import { normalizeSummaryHeadings } from "@/lib/summary-headings";
import { getHiddenTopicIds, getServerClient } from "@/lib/supabase";
import { normalizeVideoScore } from "@/lib/score-format";
import { parseLang } from "@/lib/api-helpers";
import { previousUtcDay } from "@/lib/dates-utc";

/**
 * GET /api/videos/top?lang=fr
 *
 * Returns ONE transcribed YouTube video for the Briefing's
 * "TOP VIDEO · MAINTENANT" card. Backed by `home_surface_queue`
 * (migration 022): every video transcription scored ≥ 7 with topic /
 * slug / published_date set is inserted into the queue at scoring
 * time. The route scans queue candidates in round-robin order, hydrates
 * the backing video/transcription, first keeps today's UTC publications,
 * and falls back to yesterday when today has no match. Then it bumps
 * `display_count` on the selected fresh row.
 *
 * Threshold
 * ---------
 * TOP VIDEO uses a fixed threshold of 8/10. The legacy `homeMinScoreVideo`
 * preference is no longer exposed in Settings, and this endpoint has never
 * read it — the fixed product threshold guarantees an overly strict user
 * cookie (9 or 10) can never blank the home card.
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
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const QUEUE_SCAN_BATCH_SIZE = 100;
const QUEUE_SCAN_MAX_ROWS = 1000;
/** Fixed TOP VIDEO threshold: 8/10. */
const DEFAULT_MIN_SCORE = 8;
/**
 * Only scan queue rows inserted within this window. `home_surface_queue`
 * grows unbounded (every video scored ≥ 7 is appended at scoring time
 * and never pruned), and the live scan orders by `display_count ASC` —
 * so the ever-growing backlog of stale, never-shown rows (display_count
 * 0, not today/yesterday) sorts to the FRONT and can exhaust the
 * `QUEUE_SCAN_MAX_ROWS` budget before the scan ever reaches today's
 * fresh video (which sinks behind the backlog as soon as it's shown
 * once and its display_count rises). That made the TOP VIDEO card show
 * once then vanish. A queue row is always inserted AT or AFTER the
 * backing video's publication, so any video fresh enough to pass the
 * today/yesterday filter below was necessarily inserted recently too.
 * Bounding the scan to a generous 72h `inserted_at` window
 * never drops a fresh candidate while keeping the scan set tiny. */
const QUEUE_INSERT_FRESH_WINDOW_MS = 3 * ONE_DAY_MS;

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

function topVideoDates(now: number): { today: string; yesterday: string } {
  const today = new Date(now).toISOString().slice(0, 10);
  return { today, yesterday: previousUtcDay(today) };
}

function isPublicationOnUtcDate(iso: string | null | undefined, targetDate: string, now: number): boolean {
  if (!iso) return false;
  const publishedAt = new Date(iso).getTime();
  if (!Number.isFinite(publishedAt) || publishedAt > now) return false;
  return new Date(publishedAt).toISOString().slice(0, 10) === targetDate;
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
  summary_score: number | string | null;
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
  queue?: QueueRow;
  video: VideoTopItem;
}

function isFreshPublication(iso: string | null | undefined, now: number): boolean {
  if (!iso) return false;
  const { today, yesterday } = topVideoDates(now);
  return isPublicationOnUtcDate(iso, today, now)
    || isPublicationOnUtcDate(iso, yesterday, now);
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
  const trRes = await db
    .from("video_transcriptions")
    .select(
      "id, video_id, summary_md, topic_id, slug_keywords, published_date, summary_score, title_localized",
    )
    .in("id", refIds);
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
    targetDate,
    mode,
    offset,
  }: {
    lang: Lang;
    threshold: number;
    hiddenTopics: string[];
    now: number;
    targetDate: string;
    mode: "live" | "history";
    offset: number;
  },
): Promise<FreshVideoCandidate[]> {
  const queueInsertCutoffIso = new Date(now - QUEUE_INSERT_FRESH_WINDOW_MS).toISOString();
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
      .gte("score", threshold)
      // Bound the scan to recently-queued rows so the stale backlog can't
      // exhaust QUEUE_SCAN_MAX_ROWS before reaching today's fresh video.
      .gte("inserted_at", queueInsertCutoffIso);

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

    const targetTranscriptions = Array.from(transcriptionsById.values())
      .filter((row) => row.published_date === targetDate);
    if (targetTranscriptions.length === 0) {
      if (queueRows.length < QUEUE_SCAN_BATCH_SIZE) break;
      scanned += queueRows.length;
      continue;
    }

    const videoIds = Array.from(new Set(targetTranscriptions.map((row) => row.video_id)));
    const { data: videoData, error: videoErr } = await db
      .from("youtube_videos")
      .select(
        "video_id, title, description, channel_title, channel_id, published, thumbnail, view_count, duration_sec, link",
      )
      .in("video_id", videoIds);

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
      if (tr.published_date !== targetDate) continue;
      const yv = videoById.get(tr.video_id);
      if (!yv) continue;
      if (!isPublicationOnUtcDate(yv.published, targetDate, now)) continue;
      fresh.push({ queue: queueRow, video: toVideoTopItem(tr, yv, lang) });
      if (fresh.length >= offset + 2) break;
    }

    if (queueRows.length < QUEUE_SCAN_BATCH_SIZE) break;
    scanned += queueRows.length;
  }

  return fresh.slice(offset, offset + 2);
}

async function getFreshVideoCandidatesFromTranscriptions(
  db: SupabaseClient,
  {
    lang,
    threshold,
    hiddenTopics,
    now,
    targetDate,
    offset,
  }: {
    lang: Lang;
    threshold: number;
    hiddenTopics: string[];
    now: number;
    targetDate: string;
    offset: number;
  },
): Promise<FreshVideoCandidate[]> {
  const fresh: FreshVideoCandidate[] = [];

  let q = db
    .from("video_transcriptions")
    .select(
      "id, video_id, summary_md, topic_id, slug_keywords, published_date, summary_score, title_localized",
    )
    .eq("lang", lang)
    .gte("summary_score", threshold)
    .not("summary_md", "is", null)
    .not("topic_id", "is", null)
    .not("slug_keywords", "is", null)
    .not("published_date", "is", null)
    .eq("published_date", targetDate)
    .order("summary_score", { ascending: false })
    .order("summary_scored_at", { ascending: false })
    .limit(100);

  if (hiddenTopics.length > 0) {
    q = q.not("topic_id", "in", `(${hiddenTopics.map((id) => `"${id}"`).join(",")})`);
  }

  const { data: trData, error: trErr } = await q;
  if (trErr) {
    console.error(`[/api/videos/top] fallback transcription SELECT error: ${trErr.message}`);
    return [];
  }

  const transcriptions = (trData ?? []) as unknown as TranscriptionRow[];
  if (transcriptions.length === 0) return [];

  const videoIds = Array.from(new Set(transcriptions.map((row) => row.video_id)));
  const { data: videoData, error: videoErr } = await db
    .from("youtube_videos")
    .select(
      "video_id, title, description, channel_title, channel_id, published, thumbnail, view_count, duration_sec, link",
    )
    .in("video_id", videoIds);

  if (videoErr) {
    console.error(`[/api/videos/top] fallback youtube_videos SELECT error: ${videoErr.message}`);
    return [];
  }

  const videoById = new Map<string, YoutubeVideoRow>();
  for (const row of (videoData ?? []) as YoutubeVideoRow[]) {
    videoById.set(row.video_id, row);
  }

  for (const tr of transcriptions) {
    const yv = videoById.get(tr.video_id);
    if (!yv) continue;
    if (!isPublicationOnUtcDate(yv.published, targetDate, now)) continue;
    fresh.push({ video: toVideoTopItem(tr, yv, lang) });
    if (fresh.length >= offset + 2) break;
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
  // Fixed product threshold: TOP VIDEO should show any strong recap
  // (>= 8/10). Ignore stale/over-strict cookies so the home card does
  // not disappear for users who previously set 9 or 10.
  const threshold = DEFAULT_MIN_SCORE;
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

  const dbP = getServerClient();
  if (!dbP) {
    const empty: TopVideoPayload = { video: null, hasOlder: false, offset };
    return jsonResponse(empty, bucket, now);
  }

  const db = await dbP;
  const hiddenTopics = await getHiddenTopicIds();
  const { today, yesterday } = topVideoDates(now);

  const getCandidatesForDate = async (
    targetDate: string,
    mode: "live" | "history",
    candidateOffset: number,
  ): Promise<FreshVideoCandidate[]> => {
    let candidates = await getFreshVideoCandidates(db, {
      lang,
      threshold,
      hiddenTopics,
      now,
      targetDate,
      mode,
      offset: candidateOffset,
    });
    if (candidates.length === 0) {
      candidates = await getFreshVideoCandidatesFromTranscriptions(db, {
        lang,
        threshold,
        hiddenTopics,
        now,
        targetDate,
        offset: candidateOffset,
      });
    }
    return candidates;
  };

  if (isLive) {
    let candidates = await getCandidatesForDate(today, "live", 0);
    if (candidates.length === 0) {
      // Product contract: show today's top video first; if today has no
      // qualifying recap, fall back to yesterday rather than hiding the
      // home card.
      candidates = await getCandidatesForDate(yesterday, "live", 0);
    }

    const picked = candidates[0];
    if (!picked) {
      const empty: TopVideoPayload = { video: null, hasOlder: false, offset };
      return jsonResponse(empty, bucket, now);
    }

    if (picked.queue) {
      await markVideoDisplayed(db, picked.queue, now);
    }

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
  // accessible from the chevron browse. Offset is applied after the 48h
  // freshness filter, so chevrons never land on stale videos.
  let candidates = await getCandidatesForDate(today, "history", offset);
  if (candidates.length === 0) {
    candidates = await getCandidatesForDate(yesterday, "history", offset);
  }

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
