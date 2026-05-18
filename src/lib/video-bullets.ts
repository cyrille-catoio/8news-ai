/**
 * Shared helpers for fan-out of a video AI summary into `summary_bullets`
 * (one row per bullet, `source_type='video'`).
 *
 * v2.10.3+ — extracted from `transcribe-video.ts` so both the regular
 * write path (cron-video-transcribe-background fresh transcribe with
 * `persistBullets=true`) and the new « backfill missing bullets » pass
 * (same cron, second loop) share the exact same row shape. Keeping it
 * in one place also makes the row-shape contract testable in isolation.
 *
 * The user-facing synchronous routes
 * (`POST /api/youtube-channels/transcribe` and the `?prewarm=1` GET on
 * `/api/youtube-channels/videos`) DO NOT call into this module — they
 * leave the default `persistBullets=false` on `transcribeVideo()` so
 * no user click ever writes a bullet row. The next cron tick backfills
 * those rows via the dedicated pass.
 */

/** Per-bullet row shape inserted into `summary_bullets` for videos. */
export interface VideoBulletRow {
  video_transcription_id: number;
  topic_id: string | null;
  lang: "en" | "fr";
  summary_date: string;
  bullet_index: number;
  text: string;
  refs: Array<{ title: string; link: string; source: string }>;
  source_type: string;
  entities: string[];
}

/** All the context needed to fan a single video summary into bullet rows. */
export interface VideoBulletInput {
  transcriptionId: number;
  topicId: string | null;
  lang: "en" | "fr";
  videoId: string;
  videoTitle: string;
  channelTitle: string | null;
  /** YYYY-MM-DD of the video's `published_date` (mig. 014). v2.10.3+ —
   *  used as `summary_date` so the bullet row matches the per-video
   *  SSR archive `/[topic]/v/{published_date}/{slug}` rather than the
   *  wall-clock day the transcription happened to run. */
  publishedDate: string | null;
  summaryMd: string;
}

/**
 * Parse the « ## KEY POINTS » / « ## POINTS CLÉS » block of the
 * Markdown summary into a flat array of bullet bodies. Multi-line
 * paragraphs under a single bullet stay joined into one string.
 * Stops at the next `##` heading (typically `## CONCLUSION`).
 */
export function extractBulletsFromMarkdown(md: string): string[] {
  const lines = md.split("\n");
  let inBullets = false;
  const bullets: string[] = [];
  let current = "";

  for (const line of lines) {
    if (/^##\s+Points\s+cl/i.test(line) || /^##\s+Key\s+points/i.test(line)) {
      inBullets = true;
      continue;
    }
    if (inBullets && /^##\s/.test(line)) break;
    if (!inBullets) continue;

    if (/^\s*[-*]\s/.test(line)) {
      if (current) bullets.push(current.trim());
      current = line.replace(/^\s*[-*]\s+/, "").trim();
    } else if (current && line.trim()) {
      current += " " + line.trim();
    }
  }
  if (current) bullets.push(current.trim());

  return bullets;
}

/**
 * Build the array of rows ready to pass to `insertVideoBullets`.
 *
 * - `summary_date` falls back to today's UTC date when `publishedDate`
 *   is missing (legacy rows before mig 014's NOT NULL backfill could in
 *   theory be NULL — defensive default).
 * - `refs` carries exactly one entry pointing at the source YouTube
 *   video so the bullet has an attributable link in the favorites
 *   archive and (future) cross-feature aggregations.
 */
export function buildVideoBulletRows(input: VideoBulletInput): VideoBulletRow[] {
  const bullets = extractBulletsFromMarkdown(input.summaryMd);
  if (bullets.length === 0) return [];

  const summaryDate = input.publishedDate
    ? input.publishedDate.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const ref = {
    title: (input.videoTitle ?? "").trim() || "Untitled",
    link: `https://www.youtube.com/watch?v=${input.videoId}`,
    source: (input.channelTitle ?? "").trim() || "YouTube",
  };

  return bullets.map((text, i) => ({
    video_transcription_id: input.transcriptionId,
    topic_id: input.topicId,
    lang: input.lang,
    summary_date: summaryDate,
    bullet_index: i,
    text: text.replace(/\*\*/g, "").trim(),
    refs: [ref],
    source_type: "video",
    entities: [],
  }));
}
