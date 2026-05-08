import type { SupabaseClient } from "@supabase/supabase-js";
import { getChannelLatest, type RssVideoResult } from "./transcript-api";

/**
 * Pulls the latest videos for every active YouTube channel via
 * TranscriptAPI and upserts them into `youtube_videos`. Used by:
 *
 *  - `GET /api/youtube-channels/videos` — keeps the SPA's videos page
 *    fresh on every visit (organic traffic only).
 *  - `cron-video-transcribe-background` — runs every 15 min so the
 *    transcribe pipeline has fresh source rows even when no visitor
 *    has hit the SPA recently. (Without this, a quiet day on the
 *    front-end starves the cron and the 24 h transcription window
 *    silently drifts to 0 candidates — as happened in production
 *    May 6-8 2026 before this was added.)
 *
 * Best-effort per channel: a failing TranscriptAPI call (rate limit,
 * network, channel ID drift) is counted as `channelsFailed` and the
 * loop keeps going so one bad channel never starves the others.
 */
export interface RefreshYoutubeVideosResult {
  channelsTotal: number;
  channelsOk: number;
  channelsFailed: number;
  /** Total rows passed to `upsert` across all channels (not de-duplicated). */
  rowsUpserted: number;
}

/** UTC YYYY-MM-DD — matches the existing `youtube_videos.published_date` column shape. */
function toDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function refreshYoutubeVideosFromRss(
  db: SupabaseClient,
): Promise<RefreshYoutubeVideosResult> {
  const { data: channels } = await db
    .from("youtube_channels")
    .select("channel_id, title, topic_id")
    .eq("is_active", true);

  if (!channels || channels.length === 0) {
    return { channelsTotal: 0, channelsOk: 0, channelsFailed: 0, rowsUpserted: 0 };
  }

  let channelsOk = 0;
  let channelsFailed = 0;
  let rowsUpserted = 0;

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
          rowsUpserted += rows.length;
        }
        channelsOk++;
      } catch (err) {
        channelsFailed++;
        const msg = err instanceof Error ? err.message : "unknown";
        // Logged at warn rather than thrown so the surrounding cron / API
        // route can keep processing the remaining channels.
        console.warn(
          `[refresh-youtube-videos] channel=${ch.channel_id} failed: ${msg}`,
        );
      }
    }),
  );

  return { channelsTotal: channels.length, channelsOk, channelsFailed, rowsUpserted };
}
