import { NextRequest, NextResponse } from "next/server";
import { getChannelLatest, type RssVideoResult } from "@/lib/transcript-api";
import { createClient } from "@supabase/supabase-js";
import { normalizeSummaryHeadings } from "@/lib/summary-headings";
import { enrichDurations } from "@/lib/youtube-duration";
import { transcribeVideo } from "@/lib/transcribe-video";

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

/** API list row: persisted AI summary for the requested UI language, if any. */
export type VideoListResponseItem = VideoItem & {
  summaryMd: string | null;
  /**
   * Slug + topic_id of the SSR per-video page (`/{topic}/v/{date}/{slug}`)
   * for the requested UI language. Both null until the video is transcribed
   * AND the channel has an assigned topic_id (without which the route can't
   * exist). Consumed by `VideoCard` to show a "Read article" link.
   */
  topicId: string | null;
  slugKeywords: string | null;
  publishedDate: string | null;
};

const BRIEFING_PREWARM_BUCKET_MS = 10 * 60 * 1000;
const MIN_BRIEFING_VIDEO_DURATION_SEC = 120;
const briefingPrewarmDone = new Set<string>();
const briefingPrewarmInFlight = new Map<string, Promise<boolean>>();

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

async function prewarmLatestMissingTranscription({
  rows,
  uiLang,
  summaryByVideoId,
  targetDate,
}: {
  rows: Array<Record<string, unknown>>;
  uiLang: "en" | "fr";
  summaryByVideoId: Map<string, string>;
  targetDate: string;
}): Promise<boolean> {
  const bucket = Math.floor(Date.now() / BRIEFING_PREWARM_BUCKET_MS);
  const cacheKey = `${targetDate}:${uiLang}:${bucket}`;
  if (briefingPrewarmDone.has(cacheKey)) return false;

  const existing = briefingPrewarmInFlight.get(cacheKey);
  if (existing) return existing;

  const run = (async () => {
    briefingPrewarmDone.add(cacheKey);

    const candidate = rows.find((r) => {
      const videoId = r.video_id as string | undefined;
      const durationSec = r.duration_sec as number | null | undefined;
      return Boolean(
        videoId &&
        !summaryByVideoId.has(videoId) &&
        r.topic_id &&
        r.channel_id &&
        durationSec != null &&
        durationSec >= MIN_BRIEFING_VIDEO_DURATION_SEC,
      );
    });

    if (!candidate) return false;

    const videoId = candidate.video_id as string;
    const result = await transcribeVideo(
      videoId,
      uiLang,
      {
        title: (candidate.title as string | null) ?? undefined,
        channelId: candidate.channel_id as string,
      },
    );

    return result.status === "ok" || result.status === "cached";
  })();

  briefingPrewarmInFlight.set(cacheKey, run);
  try {
    return await run;
  } catch (err) {
    console.warn("[youtube-videos] briefing prewarm failed", err);
    return false;
  } finally {
    briefingPrewarmInFlight.delete(cacheKey);
  }
}

export async function GET(req: NextRequest) {
  const db = getDb();

  const dateParam = req.nextUrl.searchParams.get("date");
  const targetDate = dateParam ?? toDateStr(new Date());
  const langParam = req.nextUrl.searchParams.get("lang");
  const uiLang = langParam === "fr" ? "fr" : "en";
  const tz = safeTimeZone(req.nextUrl.searchParams.get("tz"));
  const prewarm = req.nextUrl.searchParams.get("prewarm") === "1";
  const refreshRss = req.nextUrl.searchParams.get("refresh") !== "0";

  // Refresh from RSS to capture new videos. Home's paired yesterday query
  // passes `refresh=0` so one 10-minute refresh does not hit every channel
  // twice.
  if (refreshRss) await refreshFromRss(db);

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
  let summaryByVideoId = new Map<string, string>();
  // Per-video SSR slug for the current UI lang. Only set when the video
  // has been transcribed AND a topic+slug are present (the route
  // /{topic}/v/{date}/{slug} can't exist without all three).
  let slugByVideoId = new Map<string, { topicId: string; slug: string; publishedDate: string }>();
  async function loadTranscriptionMaps() {
    const nextSummaryByVideoId = new Map<string, string>();
    const nextSlugByVideoId = new Map<string, { topicId: string; slug: string; publishedDate: string }>();
    if (videoIds.length === 0) return { nextSummaryByVideoId, nextSlugByVideoId };

    const { data: trows } = await db
      .from("video_transcriptions")
      .select("video_id, summary_md, topic_id, slug_keywords, published_date")
      .in("video_id", videoIds)
      .eq("lang", uiLang);
    for (const row of trows ?? []) {
      const tr = row as {
        video_id: string;
        summary_md: string | null;
        topic_id: string | null;
        slug_keywords: string | null;
        published_date: string | null;
      };
      if (tr.summary_md && tr.summary_md.length > 0) {
        nextSummaryByVideoId.set(tr.video_id, normalizeSummaryHeadings(tr.summary_md, uiLang));
      }
      if (tr.topic_id && tr.slug_keywords && tr.published_date) {
        nextSlugByVideoId.set(tr.video_id, {
          topicId: tr.topic_id,
          slug: tr.slug_keywords,
          publishedDate: tr.published_date,
        });
      }
    }
    return { nextSummaryByVideoId, nextSlugByVideoId };
  }

  ({ nextSummaryByVideoId: summaryByVideoId, nextSlugByVideoId: slugByVideoId } = await loadTranscriptionMaps());

  if (prewarm) {
    const didPrewarm = await prewarmLatestMissingTranscription({
      rows: rows as Array<Record<string, unknown>>,
      uiLang,
      summaryByVideoId,
      targetDate,
    });
    if (didPrewarm) {
      ({ nextSummaryByVideoId: summaryByVideoId, nextSlugByVideoId: slugByVideoId } = await loadTranscriptionMaps());
    }
  }

  const results: VideoListResponseItem[] = rows.map((r: Record<string, unknown>) => {
    const videoId = r.video_id as string;
    const slug = slugByVideoId.get(videoId);
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
      topicId: slug?.topicId ?? null,
      slugKeywords: slug?.slug ?? null,
      publishedDate: slug?.publishedDate ?? null,
    };
  });

  return NextResponse.json(results);
}
