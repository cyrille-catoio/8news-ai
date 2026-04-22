import { NextRequest, NextResponse } from "next/server";
import { getChannelLatest, type RssVideoResult } from "@/lib/transcript-api";
import { createClient } from "@supabase/supabase-js";
import { normalizeSummaryHeadings } from "@/lib/summary-headings";

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

/** API list row: persisted AI summary for the requested UI language, if any. */
export type VideoListResponseItem = VideoItem & { summaryMd: string | null };

function toDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Validate an IANA timezone string. Returns null if invalid or absent. */
function safeTimeZone(tz: string | null): string | null {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

/** UTC offset (in ms) of `tz` at the given instant. East of UTC is positive. */
function tzOffsetMs(at: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "longOffset",
  });
  const tzPart = dtf
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  // Examples: "GMT+02:00", "GMT-05:30", or simply "GMT" for UTC.
  if (tzPart === "GMT") return 0;
  const m = tzPart.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;
  const sign = m[1] === "+" ? 1 : -1;
  return sign * (parseInt(m[2], 10) * 3600 + parseInt(m[3], 10) * 60) * 1000;
}

/**
 * Compute the [start, end) UTC instants of the given local calendar day in
 * the given IANA timezone. Used to resolve "give me everything published on
 * 2026-04-19 in Europe/Paris" into a precise UTC time window so we don't
 * miss videos published 00h–02h local that map to the previous UTC day.
 */
function zonedDayBounds(dateStr: string, tz: string): { start: Date; end: Date } {
  const utcMidnight = new Date(`${dateStr}T00:00:00Z`);
  const offset = tzOffsetMs(utcMidnight, tz);
  // local = UTC + offset  ⟹  UTC instant of local-midnight = UTC midnight − offset
  const start = new Date(utcMidnight.getTime() - offset);
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
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
  const langParam = req.nextUrl.searchParams.get("lang");
  const uiLang = langParam === "fr" ? "fr" : "en";
  const tz = safeTimeZone(req.nextUrl.searchParams.get("tz"));

  // Always refresh from RSS to capture new videos
  await refreshFromRss(db);

  // Query persisted videos by date.
  //
  // When the caller provides their IANA timezone (`?tz=Europe/Paris`) we
  // filter on the `published` timestamptz column with explicit local-day
  // bounds so a video published at 01:00 Paris time (= 23:00 UTC the day
  // before) is correctly listed under the requested local date. Without a
  // timezone we fall back to the legacy `published_date` filter, which is
  // computed in UTC and can shift videos by one day.
  let query = db
    .from("youtube_videos")
    .select("*")
    .order("published", { ascending: false });

  if (tz) {
    const { start, end } = zonedDayBounds(targetDate, tz);
    query = query.gte("published", start.toISOString()).lt("published", end.toISOString());
  } else {
    query = query.eq("published_date", targetDate);
  }

  const { data, error } = await query;

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

  const videoIds = rows.map((r) => (r as Record<string, unknown>).video_id as string);
  const summaryByVideoId = new Map<string, string>();
  if (videoIds.length > 0) {
    const { data: trows } = await db
      .from("video_transcriptions")
      .select("video_id, summary_md")
      .in("video_id", videoIds)
      .eq("lang", uiLang);
    for (const row of trows ?? []) {
      const tr = row as { video_id: string; summary_md: string | null };
      if (tr.summary_md && tr.summary_md.length > 0) {
        summaryByVideoId.set(tr.video_id, normalizeSummaryHeadings(tr.summary_md, uiLang));
      }
    }
  }

  const results: VideoListResponseItem[] = rows.map((r: Record<string, unknown>) => {
    const videoId = r.video_id as string;
    return {
      videoId,
      title: r.title as string,
      description: r.description as string | null,
      channelTitle: r.channel_title as string,
      channelId: r.channel_id as string,
      published: r.published as string,
      thumbnail: r.thumbnail as string | null,
      viewCount: r.view_count as string | null,
      durationSec: (r.duration_sec as number | null) ?? null,
      link: r.link as string,
      summaryMd: summaryByVideoId.get(videoId) ?? null,
    };
  });

  return NextResponse.json(results);
}
