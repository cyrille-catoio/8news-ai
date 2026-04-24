import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Helpers around the YouTube Data API v3 `/videos` endpoint we use to
 * backfill `youtube_videos.duration_sec` (the RSS feed doesn't carry
 * duration). Free tier quota is 10k units/day, this endpoint is 1
 * unit/call up to 50 IDs per call.
 *
 * Shared between:
 *  - `GET /api/youtube-channels/videos` — lazy enrichment when the SPA
 *    fetches the day's videos and some rows are missing duration.
 *  - `netlify/functions/cron-video-transcribe-background.ts` — needs
 *    duration to filter out shorts (< 120s) before transcribing.
 */

/** Parse ISO 8601 duration (PT1H2M33S) to seconds. */
export function parseIsoDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? "0") * 3600) + (parseInt(m[2] ?? "0") * 60) + parseInt(m[3] ?? "0");
}

/**
 * Fetch durations from YouTube Data API v3 for videos missing
 * `duration_sec` and persist them. Batches up to 50 IDs per call.
 * Silent no-op when `YOUTUBE_API_KEY` is not set or no IDs are given.
 */
export async function enrichDurations(
  // Loose typing: the helper is called with both the SSR Supabase client
  // and a service-role client created in a Netlify function. They share
  // enough of the surface (`from().update().eq()`) to make a strict
  // generic type more trouble than it's worth.
  db: SupabaseClient,
  videoIds: string[],
): Promise<void> {
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
        const dur = parseIsoDuration(item.contentDetails?.duration ?? "");
        if (dur > 0) {
          await db.from("youtube_videos").update({ duration_sec: dur }).eq("video_id", item.id);
        }
      }
    } catch {
      // non-critical — the next tick will retry the still-missing rows
    }
  }
}
