import { getServerClient } from "./client";

/**
 * Cross-table `summary_bullets` writers — the two bullet writers that
 * don't naturally belong to a single domain table:
 *
 *  - `insertVideoRoundupBullets` — mirrors a `video_roundups.intro_md`
 *    into `summary_bullets` (one row per bullet, source_type=`roundup`).
 *  - `insertTopSummaryBullets` — mirrors the daily Top 50 hand-picked
 *    bullets (source_type=`top50`) keyed by `(lang, summary_date)`
 *    rather than by a parent table id (the Top 50 has no parent row).
 *
 * The other bullet writers live with their domain tables:
 *  - `insertSummaryBullets` — daily-summary bullets, in `summaries.ts`
 *  - `insertVideoBullets`   — per-video bullets,    in `videos.ts`
 */

export async function insertVideoRoundupBullets(
  bullets: Array<{
    video_roundup_id: number;
    topic_id: string;
    lang: string;
    summary_date: string;
    bullet_index: number;
    text: string;
    source_type: string;
    entities: string[];
  }>,
): Promise<boolean> {
  if (bullets.length === 0) return true;
  const clientP = getServerClient();
  if (!clientP) return false;
  try {
    const supabase = await clientP;
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
  } catch (err) {
    console.error("[insertVideoRoundupBullets] unexpected error:", err);
    return false;
  }
}

export async function insertTopSummaryBullets(
  lang: string,
  summaryDate: string,
  rows: Array<{
    topic_id: string | null;
    lang: string;
    summary_date: string;
    bullet_index: number;
    text: string;
    refs: unknown;
    source_type: string;
    entities: string[];
  }>,
): Promise<boolean> {
  if (rows.length === 0) return true;
  const clientP = getServerClient();
  if (!clientP) return false;
  try {
    const supabase = await clientP;
    await supabase
      .from("summary_bullets")
      .delete()
      .eq("source_type", "top50")
      .eq("lang", lang)
      .eq("summary_date", summaryDate);
    const { error } = await supabase.from("summary_bullets").insert(rows);
    return !error;
  } catch {
    return false;
  }
}
