import { createClient } from "@supabase/supabase-js";
import {
  scoreVideoSummaryBatch,
  type VideoSummaryScoreInput,
} from "../../src/lib/score-video-summary-batch";

/**
 * Background (≤15 min): scores AI Markdown video recaps in `video_transcriptions`
 * with batched OpenAI calls and writes `summary_score` (1-10) + `summary_scored_at`.
 *
 * Trigger every ~15 min via cron-job.org GET:
 *   /.netlify/functions/cron-video-summary-score-background?secret=$CRON_SECRET
 *
 * Catch-up: processes oldest unscored rows first (`id ASC`). Each HTTP request
 * runs multiple batches until wall budget or backlog exhaustion.
 *
 * Uses Netlify v2 function signature (default export, returns Response | void),
 * matching the other cron-*-background.ts files in this folder. Returning a
 * plain `{ statusCode, body }` object would crash the v2 runtime with
 * "Function returned an unsupported value".
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
const MODEL = process.env.VIDEO_SUMMARY_SCORE_MODEL ?? "gpt-4.1-nano";

async function runCron(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !url || !key) {
    console.error("[cron-video-summary-score] Missing OPENAI_API_KEY or Supabase env");
    return;
  }

  const startedAt = Date.now();
  const deadline = startedAt + Math.min(CRON_WALL_MS, CRON_BUDGET_MS);
  const remaining = () => deadline - Date.now();

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let batchNo = 0;
  let totalScored = 0;
  let totalRows = 0;
  const lines: string[] = [];

  const minRemainingToStartBatch = CRON_SAFETY_MS + OPENAI_TIMEOUT_MS + 2000;

  while (remaining() > minRemainingToStartBatch) {
    const { data: rowsRaw, error: fetchErr } = await supabase
      .from("video_transcriptions")
      .select("id, video_id, title, lang, summary_md")
      .is("summary_score", null)
      .not("summary_md", "is", null)
      .neq("summary_md", "")
      .order("id", { ascending: true })
      .limit(Math.max(1, Math.min(BATCH_SIZE, BATCH_CAP)));

    if (fetchErr) {
      console.error(`[cron-video-summary-score] fetch: ${fetchErr.message}`);
      break;
    }

    const rows = (rowsRaw ?? []) as VideoSummaryScoreInput[];
    if (rows.length === 0) {
      lines.push("[cron-video-summary-score] backlog empty");
      break;
    }

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
      } else {
        totalScored += 1;
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

  const summary = `[run] cron=video-summary-score batches=${batchNo} rows_touched=${totalRows} updates_ok=${totalScored} elapsed_ms=${Date.now() - startedAt} budget_ms=${Math.min(CRON_WALL_MS, CRON_BUDGET_MS)} batch_cap=${BATCH_CAP} model=${MODEL}`;
  lines.push(summary);
  console.log(lines.join("\n"));
}

export default async (req: Request): Promise<Response | undefined> => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const url = new URL(req.url);
    const provided = url.searchParams.get("secret");
    if (provided !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  await runCron();
  return undefined;
};
