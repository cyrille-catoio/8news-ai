import { withClient } from "./client";

/**
 * Cross-table `summary_bullets` writers — the two bullet writers that
 * don't naturally belong to a single domain table:
 *
 *  - `insertVideoRoundupBullets` — mirrors a `video_roundups.intro_md`
 *    into `summary_bullets` (one row per bullet, `source_type='video_roundup'`).
 *  - `insertTopSummaryBullets` — mirrors the daily Top 50 hand-picked
 *    bullets (`source_type='top50'`) keyed by `(lang, summary_date)`
 *    rather than by a parent table id (the Top 50 has no parent row).
 *
 * The other bullet writers live with their domain tables:
 *  - `insertSummaryBullets` — daily-summary bullets (`source_type='daily_summary'`
 *    since v2.10.3+; was DB default `'article'` before), in `summaries.ts`.
 *  - `insertVideoBullets`   — per-video bullets (`source_type='video'`),
 *    in `videos.ts`. v2.10.3+ — only called from the cron, never from
 *    user-triggered routes (the synchronous transcribe endpoint and the
 *    `?prewarm=1` GET set `persistBullets=false` so they skip this writer).
 */

export async function insertVideoRoundupBullets(
  bullets: Array<{
    video_roundup_id: number;
    topic_id: string;
    lang: string;
    summary_date: string;
    bullet_index: number;
    /** v2.10.3+ — short editorial title above the body. Mirror of the
     *  `### Title` line emitted by the roundup prompt. NULL if the
     *  prompt produced a bullet without a heading (defensive). */
    title: string | null;
    text: string;
    /** v2.10.3+ — passed explicitly as `[]` so the column is populated
     *  contractually instead of relying on the DB default. Roundup
     *  bullets' source attribution lives in `video_roundup_videos`. */
    refs: unknown;
    source_type: string;
    entities: string[];
  }>,
): Promise<boolean> {
  if (bullets.length === 0) return true;
  return withClient("insertVideoRoundupBullets", false, async (supabase) => {
    await supabase
      .from("summary_bullets")
      .delete()
      .eq("video_roundup_id", bullets[0].video_roundup_id);
    const { error } = await supabase.from("summary_bullets").insert(bullets);
    if (error) {
      console.error("[insertVideoRoundupBullets] insert failed:", error.message);
      return false;
    }
    return true;
  }, "error");
}

export async function insertTopSummaryBullets(
  lang: string,
  summaryDate: string,
  rows: Array<{
    topic_id: string | null;
    lang: string;
    summary_date: string;
    bullet_index: number;
    /**
     * Short journalistic title rendered in bold above the bullet body.
     * Populated since migration 024 by the Top articles pipeline only;
     * NULL on legacy rows (any insert before the column existed) and
     * still NULL for any future writer that doesn't produce a title.
     */
    title: string | null;
    text: string;
    refs: unknown;
    source_type: string;
    entities: string[];
    /**
     * Editorial importance 1-10 propagated from the LLM `importance`
     * field (Top 24h pipeline, mig. 026+). Same value across every row
     * of a same-`title` run. NULL when the LLM omitted the score.
     */
    importance_score: number | null;
    /**
     * Set on the « top videos of yesterday » bullets pinned at the head
     * of the Daily Podcast — points at `video_transcriptions.id` so
     * readers can tell video bullets apart from article bullets.
     * Omitted/NULL on regular article bullets.
     */
    video_transcription_id?: number | null;
  }>,
): Promise<boolean> {
  if (rows.length === 0) return true;
  return withClient("insertTopSummaryBullets", false, async (supabase) => {
    await supabase
      .from("summary_bullets")
      .delete()
      .eq("source_type", "top50")
      .eq("lang", lang)
      .eq("summary_date", summaryDate);
    const insertRes = await supabase.from("summary_bullets").insert(rows);
    if (!insertRes.error) return true;

    console.error("[insertTopSummaryBullets] insert failed:", insertRes.error.message);
    return false;
  }, "error");
}
