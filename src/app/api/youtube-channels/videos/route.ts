import { NextRequest, NextResponse } from "next/server";
import { getChannelLatest, type RssVideoResult } from "@/lib/transcript-api";
import { createClient } from "@supabase/supabase-js";

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Parse ISO 8601 duration (PT1H2M33S) to seconds. */
function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? "0") * 3600) + (parseInt(m[2] ?? "0") * 60) + parseInt(m[3] ?? "0");
}

/**
 * Fetch durations from YouTube Data API v3 for videos missing duration_sec.
 * Batches up to 50 IDs per call (1 quota unit each, free tier = 10k/day).
 */
async function enrichDurations(db: ReturnType<typeof getDb>, videoIds: string[]) {
  const ytKey = process.env.YOUTUBE_API_KEY;
  if (!ytKey || videoIds.length === 0) return;

  const BATCH = 50;
  for (let i = 0; i < videoIds.length; i += BATCH) {
    const batch = videoIds.slice(i, i + BATCH);
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?id=${batch.join(",")}&part=contentDetails&key=${ytKey}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      for (const item of json.items ?? []) {
        const dur = parseDuration(item.contentDetails?.duration ?? "");
        if (dur > 0) {
          await db.from("youtube_videos").update({ duration_sec: dur }).eq("video_id", item.id);
        }
      }
    } catch {
      // non-critical
    }
  }
}

export interface VideoItem {
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
}

function toDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Fetch latest videos from all active channels via TranscriptAPI RSS,
 * upsert them into youtube_videos, then return.
 */
async function refreshFromRss(db: ReturnType<typeof getDb>) {
  const { data: channels } = await db
    .from("youtube_channels")
    .select("channel_id, title, topic_id")
    .eq("is_active", true);

  if (!channels || channels.length === 0) return;

  await Promise.allSettled(
    channels.map(async (ch) => {
      try {
        const latest = await getChannelLatest(ch.channel_id);
        const rows = latest.results
          .filter((v: RssVideoResult) => v.videoId && v.published)
          .map((v: RssVideoResult) => {
            const pub = new Date(v.published!);
            return {
              video_id: v.videoId!,
              channel_id: ch.channel_id,
              channel_title: latest.channel?.title ?? ch.title,
              title: v.title ?? "Untitled",
              description: v.description ?? null,
              published: v.published!,
              published_date: toDateStr(pub),
              thumbnail: v.thumbnail?.url ?? null,
              view_count: v.viewCount ?? null,
              topic_id: ch.topic_id ?? null,
              link: v.link ?? `https://www.youtube.com/watch?v=${v.videoId}`,
            };
          });

        if (rows.length > 0) {
          await db
            .from("youtube_videos")
            .upsert(rows, { onConflict: "video_id", ignoreDuplicates: false });
        }
      } catch {
        // skip channels that fail
      }
    }),
  );
}

export async function GET(req: NextRequest) {
  const db = getDb();

  const dateParam = req.nextUrl.searchParams.get("date");
  const targetDate = dateParam ?? toDateStr(new Date());

  // Always refresh from RSS to capture new videos
  await refreshFromRss(db);

  // Query persisted videos by date
  const { data, error } = await db
    .from("youtube_videos")
    .select("*")
    .eq("published_date", targetDate)
    .order("published", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  // Enrich videos missing duration via YouTube Data API v3
  const missingDuration = rows
    .filter((r: Record<string, unknown>) => r.duration_sec == null)
    .map((r: Record<string, unknown>) => r.video_id as string);

  if (missingDuration.length > 0) {
    await enrichDurations(db, missingDuration);
    // Re-read updated rows
    const { data: updated } = await db
      .from("youtube_videos")
      .select("video_id, duration_sec")
      .in("video_id", missingDuration);
    if (updated) {
      const durMap = new Map(updated.map((u: Record<string, unknown>) => [u.video_id as string, u.duration_sec as number | null]));
      for (const r of rows) {
        const rd = r as Record<string, unknown>;
        if (rd.duration_sec == null && durMap.has(rd.video_id as string)) {
          rd.duration_sec = durMap.get(rd.video_id as string) ?? null;
        }
      }
    }
  }

  const results: VideoItem[] = rows.map((r: Record<string, unknown>) => ({
    videoId: r.video_id as string,
    title: r.title as string,
    description: r.description as string | null,
    channelTitle: r.channel_title as string,
    channelId: r.channel_id as string,
    published: r.published as string,
    thumbnail: r.thumbnail as string | null,
    viewCount: r.view_count as string | null,
    durationSec: (r.duration_sec as number | null) ?? null,
    link: r.link as string,
  }));

  return NextResponse.json(results);
}
