import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-api";
import { getChannelLatest, type RssVideoResult } from "@/lib/transcript-api";
import { createClient } from "@supabase/supabase-js";

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
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
    .select("channel_id, title")
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
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

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

  const results: VideoItem[] = (data ?? []).map((r: Record<string, unknown>) => ({
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
