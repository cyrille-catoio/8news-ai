import { createClient } from "@supabase/supabase-js";
import {
  scoreVideoSummaryBatch,
  type VideoSummaryScoreInput,
} from "../../src/lib/score-video-summary-batch";
import { enqueueHomeSurface } from "../../src/lib/supabase/home-surface";
import { startCronRun } from "./shared/cron-log";

/**
 * Background (≤15 min): scores AI Markdown video recaps in `video_transcriptions`
 * with batched OpenAI calls and writes `summary_score` (1-10) + `summary_scored_at`.
 *
 * Trigger every ~15 min via cron-job.org GET:
 *   /.netlify/functions/cron-video-summary-score-background
 *
 * Catch-up: processes oldest unscored rows first (`id ASC`). Each HTTP request
 * runs multiple batches until wall budget or backlog exhaustion.
 *
 * Uses Netlify v2 function signature (default export, returns Response | void),
 * matching the other cron-*-background.ts files in this folder. Returning a
 * plain `{ statusCode, body }` object would crash the v2 runtime with
 * "Function returned an unsupported value". No auth check (URL obscurity,
 * same as the other cron-*-background.ts files).
 */

const CRON_WALL_MS = Number(process.env.CRON_VIDEO_SUMMARY_SCORE_WALL_MS ?? 840_000);
const CRON_BUDGET_MS = Number(process.env.CRON_VIDEO_SUMMARY_SCORE_BUDGET_MS ?? 810_000);
/** Stop starting new OpenAI calls when less than this remains (finish in-flight first). */
const CRON_SAFETY_MS = Number(process.env.CRON_VIDEO_SUMMARY_SCORE_SAFETY_MS ?? 45_000);
const BATCH_SIZE = Number(process.env.VIDEO_SUMMARY_SCORE_BATCH_SIZE ?? 8);
/** Hard cap per OpenAI call — keeps prompts inside ~ context limits even if BATCH_SIZE is misconfigured. */
const BATCH_CAP = Number(process.env.VIDEO_SUMMARY_SCORE_BATCH_CAP ?? 12);
const OPENAI_TIMEOUT_MS = Number(process.env.VIDEO_SUMMARY_SCORE_OPENAI_TIMEOUT_MS ?? 20_000);
const MAX_CHARS = Number(process.env.VIDEO_SUMMARY_SCORE_MAX_CHARS ?? 3500);
// Default upgraded from `gpt-4.1-nano` to `gpt-4.1-mini` in v2.6.10:
// nano consistently picked the central 7-8 values on editorial nuance,
// so the score lost its discriminative power. mini spreads scores
// nettement better against the new composite prompt (importance ×
// quality with major-player anchor) for ~5x a baseline cost that's
// still negligible (~$0.005 / 100 recaps at the default batch size).
const MODEL = process.env.VIDEO_SUMMARY_SCORE_MODEL ?? "gpt-4.1-mini";

async function runCron(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log(
    `[cron-video-summary-score] [start] model=${MODEL} batch_size=${BATCH_SIZE} batch_cap=${BATCH_CAP} max_chars=${MAX_CHARS} openai_timeout_ms=${OPENAI_TIMEOUT_MS} wall_ms=${CRON_WALL_MS} budget_ms=${CRON_BUDGET_MS} env_openai=${apiKey ? "yes" : "NO"} env_supabase_url=${url ? "yes" : "NO"} env_supabase_srk=${key ? "yes" : "NO"}`,
  );

  if (!apiKey || !url || !key) {
    console.error(
      "[cron-video-summary-score] Missing required env (OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY) — aborting",
    );
    return;
  }

  const { elapsedMs, remaining } = startCronRun(
    "cron-video-summary-score",
    Math.min(CRON_WALL_MS, CRON_BUDGET_MS),
  );

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Pre-flight backlog count: helps tell "no work to do" from "query failed".
  const { count: backlogCount, error: countErr } = await supabase
    .from("video_transcriptions")
    .select("id", { count: "exact", head: true })
    .is("summary_score", null)
    .not("summary_md", "is", null)
    .neq("summary_md", "");

  if (countErr) {
    console.error(
      `[cron-video-summary-score] backlog_count error: ${countErr.message} (hint: check migration 021-video-summary-score.sql is applied — column summary_score may not exist)`,
    );
    return;
  }
  console.log(`[cron-video-summary-score] backlog_count=${backlogCount ?? "?"}`);

  let batchNo = 0;
  let totalScored = 0;
  let totalRows = 0;
  const lines: string[] = [];

  const minRemainingToStartBatch = CRON_SAFETY_MS + OPENAI_TIMEOUT_MS + 2000;

  while (remaining() > minRemainingToStartBatch) {
    // Pull the renderable-on-/v/ metadata in the same query so the
    // home_surface_queue insert below has everything in memory and we
    // don't need a second round-trip per scored video.
    const { data: rowsRaw, error: fetchErr } = await supabase
      .from("video_transcriptions")
      .select("id, video_id, title, lang, summary_md, topic_id, slug_keywords, published_date")
      .is("summary_score", null)
      .not("summary_md", "is", null)
      .neq("summary_md", "")
      .order("id", { ascending: true })
      .limit(Math.max(1, Math.min(BATCH_SIZE, BATCH_CAP)));

    if (fetchErr) {
      console.error(`[cron-video-summary-score] fetch: ${fetchErr.message}`);
      break;
    }

    type EnrichedRow = VideoSummaryScoreInput & {
      topic_id: string | null;
      slug_keywords: string | null;
      published_date: string | null;
    };
    const rows = (rowsRaw ?? []) as EnrichedRow[];
    if (rows.length === 0) {
      lines.push("[cron-video-summary-score] backlog empty");
      break;
    }
    const rowById = new Map(rows.map((r) => [r.id, r]));

    batchNo += 1;
    const batchStart = Date.now();

    let scored: { id: number; score: number }[] = [];
    try {
      scored = await scoreVideoSummaryBatch(rows, apiKey, {
        model: MODEL,
        maxCharsPerSummary: MAX_CHARS,
        openaiTimeoutMs: OPENAI_TIMEOUT_MS,
        maxRetries: Number(process.env.VIDEO_SUMMARY_SCORE_OPENAI_MAX_RETRIES ?? 0),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lines.push(`[batch=${batchNo}] openai_error: ${msg}`);
      console.error(`[cron-video-summary-score] OpenAI: ${msg}`);
      break;
    }

    const nowIso = new Date().toISOString();
    for (const { id, score } of scored) {
      const { error: upErr } = await supabase
        .from("video_transcriptions")
        .update({ summary_score: score, summary_scored_at: nowIso })
        .eq("id", id)
        .is("summary_score", null);

      if (upErr) {
        lines.push(`[batch=${batchNo}] db_update id=${id}: ${upErr.message}`);
        continue;
      }
      totalScored += 1;

      // Mirror the score into home_surface_queue (migration 022) so the
      // home rotation cycle picks the recap up. Skipped silently when
      // the row is unrenderable on /v/ (missing topic/slug/date) or the
      // score is below the queue floor.
      if (score >= 7) {
        const src = rowById.get(id);
        if (
          src
          && src.topic_id
          && src.slug_keywords
          && src.published_date
          && (src.lang === "en" || src.lang === "fr")
        ) {
          await enqueueHomeSurface(supabase, {
            kind: "video",
            refId: id,
            lang: src.lang,
            score,
            topicId: src.topic_id,
          });
        }
      }
    }

    totalRows += rows.length;
    lines.push(
      `[batch=${batchNo}] rows=${rows.length} scored=${scored.length} elapsed_batch=${Date.now() - batchStart}ms remaining=${remaining()}ms`,
    );

    if (scored.length === 0) {
      lines.push(`[batch=${batchNo}] no scores parsed — stopping to avoid hot loop`);
      break;
    }
  }

  const summary = `[run] cron=video-summary-score batches=${batchNo} rows_touched=${totalRows} updates_ok=${totalScored} elapsed_ms=${elapsedMs()} budget_ms=${Math.min(CRON_WALL_MS, CRON_BUDGET_MS)} batch_cap=${BATCH_CAP} model=${MODEL}`;
  lines.push(summary);
  console.log(lines.join("\n"));
}

export default async (): Promise<void> => {
  await runCron();
};
