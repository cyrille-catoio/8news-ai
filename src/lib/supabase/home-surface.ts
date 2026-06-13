import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Inserts a single candidate row into `home_surface_queue` (migration 022).
 * Used by both scoring pipelines:
 *
 *  - Article scoring (`src/lib/score-topic-dynamic.ts` and the manual
 *    feed-score route) calls this once per (article, lang) when the
 *    final `relevance_score >= 7`.
 *  - Video scoring (`netlify/functions/cron-video-summary-score-background.ts`)
 *    calls this once per video_transcriptions row when
 *    `summary_score >= 7` and the row is renderable on the SSR /v/ route
 *    (topic_id + slug_keywords + published_date all set).
 *
 * Idempotent: relies on the unique index `(kind, ref_id, lang)` and the
 * Supabase-JS `.upsert(..., { ignoreDuplicates: true })` flag, so a
 * second insert for the same key is a no-op (the existing row keeps
 * its current `display_count` / `last_displayed_at`, which is what we
 * want — re-scoring shouldn't reset the rotation state).
 *
 * Errors are logged but never thrown: the queue is best-effort. A
 * missing migration 022 just stops queue growth, leaving the existing
 * scoring pipelines unaffected.
 */
export function normalizeHomeSurfaceQueueScore(score: number): number | null {
  if (!Number.isFinite(score) || score < 1 || score > 10) return null;
  // `home_surface_queue.score` is NUMERIC(3,1) since mig 037. Preserve
  // video recap decimals (9.4) while article integer scores remain
  // integer-like (9.0 in DB, rendered/filtered as 9 by the app).
  return Math.round(score * 10) / 10;
}

export async function enqueueHomeSurface(
  client: SupabaseClient,
  row: {
    kind: "article" | "video";
    refId: number;
    lang: "en" | "fr";
    score: number;
    topicId: string | null;
  },
): Promise<void> {
  try {
    const score = normalizeHomeSurfaceQueueScore(row.score);
    if (score === null) {
      console.warn(
        `[home-surface] enqueue ${row.kind}/${row.refId}/${row.lang} skipped: invalid score=${row.score}`,
      );
      return;
    }
    const { error } = await client
      .from("home_surface_queue")
      .upsert(
        {
          kind: row.kind,
          ref_id: row.refId,
          lang: row.lang,
          score,
          topic_id: row.topicId,
        },
        { onConflict: "kind,ref_id,lang", ignoreDuplicates: true },
      );
    if (error) {
      console.warn(
        `[home-surface] enqueue ${row.kind}/${row.refId}/${row.lang} failed: ${error.message}`,
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[home-surface] enqueue ${row.kind}/${row.refId}/${row.lang} threw: ${msg}`,
    );
  }
}
