import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase";
import { NO_STORE_HEADERS, parsePositiveInt } from "@/lib/api-helpers";
import { enrichDurations } from "@/lib/youtube-duration";
import {
  SHORT_MAX_DURATION_SEC,
  isShortDuration,
} from "@/app/components/shorts/ShortsHelpers";
import type { VideoItem } from "@/lib/types";

/**
 * GET /api/videos/shorts — feed for the « Shorts » page (TikTok-style
 * vertical player, v2.20+). Returns the YouTube Shorts (< 180 s)
 * published by the tracked channels over the requested window, newest
 * first. (All `youtube_videos` rows qualify — same policy as the
 * Videos page, which also lists channels that were later deactivated.)
 *
 * Query params:
 *  - `since` — ISO instant lower bound, sent by the SPA as the local
 *    midnight of (today − 4 days) so « today / yesterday » follow the
 *    viewer's clock (`shortsWindowStartIso` in `ShortsHelpers.ts`).
 *    Invalid or out-of-range values fall back to a rolling
 *    `days × 24 h` window.
 *  - `days` — window size in days (default 5, max 14). Used for the
 *    fallback window and to clamp `since`.
 *
 * Freshness rides on the transcribe cron, which refreshes
 * `youtube_videos` from RSS every 15 min — the route never re-hits
 * TranscriptAPI itself.
 *
 * Two-query shape: Shorts are filtered in SQL so the row limit applies
 * to actual Shorts (filtering after a global limit would silently drop
 * Shorts whenever long videos filled the window). Rows with unknown
 * `duration_sec` (fresh RSS upserts) are fetched separately, enriched
 * via the YouTube Data API, then merged — without this, today's Shorts
 * would never qualify since unknown duration is not a Short.
 */

export const dynamic = "force-dynamic";

const DEFAULT_WINDOW_DAYS = 5;
const MAX_WINDOW_DAYS = 14;
/** Generous bound on classified Shorts: 5 days across ~40 channels stays far under this. */
const ROW_LIMIT = 500;
/** Newest unknown-duration rows enriched per request (3 YouTube quota units max). */
const ENRICH_LIMIT = 150;

const SELECT_COLS =
  "video_id, channel_id, channel_title, title, description, published, thumbnail, view_count, duration_sec, link";

interface ShortsRow {
  video_id: string;
  channel_id: string;
  channel_title: string;
  title: string;
  description: string | null;
  published: string;
  thumbnail: string | null;
  view_count: string | null;
  duration_sec: number | null;
  link: string;
}

function toVideoItem(r: ShortsRow): VideoItem {
  return {
    videoId: r.video_id,
    title: r.title,
    description: r.description,
    channelTitle: r.channel_title,
    channelId: r.channel_id,
    published: r.published,
    thumbnail: r.thumbnail,
    viewCount: r.view_count,
    durationSec: r.duration_sec,
    link: r.link,
  };
}

export async function GET(req: NextRequest) {
  const dbP = getServerClient();
  if (!dbP) {
    // No env → empty feed, not a 500 (same convention as /api/videos/top).
    return NextResponse.json({ shorts: [] }, { headers: NO_STORE_HEADERS });
  }
  const db = await dbP;

  const params = req.nextUrl.searchParams;
  const days = Math.min(MAX_WINDOW_DAYS, parsePositiveInt(params.get("days"), DEFAULT_WINDOW_DAYS));

  const now = Date.now();
  const oldestAllowed = now - MAX_WINDOW_DAYS * 86_400_000;
  const fallbackSince = now - days * 86_400_000;
  const sinceParam = Date.parse(params.get("since") ?? "");
  const since = new Date(
    Number.isFinite(sinceParam) && sinceParam >= oldestAllowed && sinceParam <= now
      ? sinceParam
      : fallbackSince,
  ).toISOString();

  const [classifiedRes, unknownRes] = await Promise.all([
    db
      .from("youtube_videos")
      .select(SELECT_COLS)
      .gte("published", since)
      .gt("duration_sec", 0)
      .lt("duration_sec", SHORT_MAX_DURATION_SEC)
      .order("published", { ascending: false })
      .limit(ROW_LIMIT),
    db
      .from("youtube_videos")
      .select(SELECT_COLS)
      .gte("published", since)
      .is("duration_sec", null)
      .order("published", { ascending: false })
      .limit(ENRICH_LIMIT),
  ]);

  if (classifiedRes.error) {
    console.error(`[/api/videos/shorts] youtube_videos SELECT error: ${classifiedRes.error.message}`);
    return NextResponse.json(
      { error: classifiedRes.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const shortsRows = (classifiedRes.data ?? []) as unknown as ShortsRow[];

  // Enrich the unknown-duration rows and keep the ones that turn out to
  // be Shorts. Rows YouTube can't classify (deleted videos, lives) stay
  // NULL and are re-attempted next request — bounded by ENRICH_LIMIT at
  // 1 quota unit per 50 ids, negligible against the 10k/day quota.
  if (unknownRes.error) {
    console.warn(`[/api/videos/shorts] unknown-duration SELECT error: ${unknownRes.error.message}`);
  }
  const unknownRows = (unknownRes.data ?? []) as unknown as ShortsRow[];
  if (unknownRows.length > 0) {
    if (!process.env.YOUTUBE_API_KEY) {
      // Without the key, fresh rows can never be classified and today's
      // Shorts silently miss the feed — say so in the logs.
      console.warn(
        `[/api/videos/shorts] YOUTUBE_API_KEY not set — ${unknownRows.length} recent row(s) have no duration and cannot be classified as Shorts`,
      );
    } else {
      await enrichDurations(
        db,
        unknownRows.map((r) => r.video_id),
      );
      const { data: updated, error: rereadError } = await db
        .from("youtube_videos")
        .select("video_id, duration_sec")
        .in(
          "video_id",
          unknownRows.map((r) => r.video_id),
        );
      if (rereadError) {
        console.warn(`[/api/videos/shorts] duration re-read error: ${rereadError.message}`);
      } else if (updated) {
        const durByVideoId = new Map(
          updated.map((u) => [u.video_id as string, u.duration_sec as number | null]),
        );
        for (const r of unknownRows) {
          r.duration_sec = durByVideoId.get(r.video_id) ?? null;
        }
        shortsRows.push(...unknownRows.filter((r) => isShortDuration(r.duration_sec)));
      }
    }
  }

  const shorts: VideoItem[] = shortsRows
    .sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0))
    .map(toVideoItem);

  return NextResponse.json({ shorts }, { headers: NO_STORE_HEADERS });
}
