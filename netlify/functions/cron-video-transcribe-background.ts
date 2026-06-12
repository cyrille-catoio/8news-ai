import { createClient } from "@supabase/supabase-js";
import { transcribeVideo } from "./shared/transcribe-video";
import { enrichDurations } from "../../src/lib/youtube-duration";
import { refreshYoutubeVideosFromRss } from "../../src/lib/refresh-youtube-videos";
import { buildVideoBulletRows } from "../../src/lib/video-bullets";
import { insertVideoBullets } from "../../src/lib/supabase";
import { startCronRun } from "./shared/cron-log";
import { sendCronAlert } from "./shared/cron-alert";

/**
 * 15-minute background function — pre-warms the AI summary cache for
 * "today's videos" (24 h rolling window) so the SPA's `/app/videos`
 * page renders summaries instantly without firing on-page transcribe
 * calls.
 *
 * For each candidate video that doesn't already have a transcription
 * row, the cron transcribes in BOTH languages (en + fr). The first
 * lang runs the full pipeline (~25s); the second lang hits the
 * translate path (~8s) since the alt-lang cache row now exists.
 *
 * Shorts (< 120s) are skipped to match the SPA's default "Vidéos du
 * jour" filter and avoid spending OpenAI tokens on low-value content.
 *
 * The synchronous `/api/youtube-channels/transcribe` route stays in
 * place for very-fresh videos that haven't been picked up yet by a
 * tick — both surfaces share the same `transcribeVideo()` lib so the
 * resulting cache rows are byte-identical.
 *
 * Mirror of `cron-video-roundup-background.ts`: same wall budget, same
 * skip-if-exists pattern via a single bulk SELECT, same MAX_*_PER_RUN
 * cap. Triggered externally via cron-job.org.
 */

const WALL_MS = 840_000;                                                // 14 min
const BUDGET_MS = Number(process.env.TRANSCRIBE_BUDGET_MS ?? 810_000);  // 13.5 min
const SAFETY_MS = 200_000;                                              // > CRON_OPENAI_TIMEOUT_MS — never start a transcribe we can't finish
const MAX_BUCKETS_PER_RUN = Number(process.env.TRANSCRIBE_MAX_PER_RUN ?? 40);

/**
 * Source pool window. 24 h rolling on `youtube_videos.published`
 * (a TIMESTAMPTZ column) so we cover every video that any reasonable
 * user timezone would consider "today" without having to materialize
 * per-tz buckets.
 */
const WINDOW_HOURS = 24;

/** Anything shorter is treated as a Short and skipped. Mirrors the
 *  SPA's default toggle on `/app/videos`. */
const MIN_DURATION_SEC = 120;

/** Background functions have a 15 min budget; we can afford a much
 *  longer per-call OpenAI timeout than the synchronous route. */
const CRON_OPENAI_TIMEOUT_MS = 180_000;

/** OpenAI model for background video transcription. */
const CRON_AI_MODEL = "gpt-5.3-chat-latest";

const ALL_LANGS = ["en", "fr"] as const;

/** Backfill pass cap. v2.10.3+ — after the regular transcribe loop, the
 *  cron scans for video_transcriptions whose summary_bullets count is
 *  zero (legacy rows from before mig 014, prewarm/user clicks that
 *  wrote only the transcription, etc.) and fans out their bullets.
 *  50 rows × ~10 ms per insert = ~500 ms, comfortable under the budget. */
const BACKFILL_BATCH = 50;
/** Safety floor on the wall clock before starting the backfill pass.
 *  Skips backfill entirely if the transcribe loop ran long. */
const BACKFILL_MIN_REMAINING_MS = 30_000;

interface CandidateVideo {
  video_id: string;
  title: string | null;
  channel_id: string;
  duration_sec: number | null;
  published: string;
}

export default async () => {
  const { elapsedMs, remaining } = startCronRun(
    "cron-video-transcribe",
    Math.min(WALL_MS, BUDGET_MS),
  );
  const lines: string[] = [];

  console.log("[cron-video-transcribe] Starting background function");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // 0. Pull the latest videos from every active channel BEFORE we look
  // at the candidate window. Without this step the cron silently
  // depended on organic SPA traffic to keep `youtube_videos` fresh —
  // a quiet 48 h on /app/videos starves the table and the cron logs
  // « No candidate videos in the last 24h » indefinitely. The refresh
  // is best-effort: a failing TranscriptAPI on one channel is
  // counted but doesn't abort the run.
  try {
    const refreshStart = Date.now();
    const refreshResult = await refreshYoutubeVideosFromRss(supabase);
    console.log(
      `[cron-video-transcribe] rss-refresh channels=${refreshResult.channelsTotal} ok=${refreshResult.channelsOk} failed=${refreshResult.channelsFailed} rows_upserted=${refreshResult.rowsUpserted} elapsed_ms=${Date.now() - refreshStart}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.warn(`[cron-video-transcribe] rss-refresh threw — ${msg}`);
  }

  // 1. Pull candidates: published in the last 24h, has a topic_id (so the
  // SSR `/v/` page can be generated downstream).
  const sinceIso = new Date(Date.now() - WINDOW_HOURS * 3_600_000).toISOString();
  const { data: candidatesRaw, error: candidatesErr } = await supabase
    .from("youtube_videos")
    .select("video_id, title, channel_id, duration_sec, published")
    .gte("published", sinceIso)
    .not("topic_id", "is", null)
    .order("published", { ascending: false });

  if (candidatesErr) {
    console.log(`[cron-video-transcribe] DB error (candidates): ${candidatesErr.message}`);
    return;
  }

  const candidates = (candidatesRaw ?? []) as CandidateVideo[];
  if (candidates.length === 0) {
    console.log("[cron-video-transcribe] No candidate videos in the last 24h");
    return;
  }

  // 2. Backfill missing durations via YouTube Data API, then re-read.
  const missingDuration = candidates
    .filter((c) => c.duration_sec == null)
    .map((c) => c.video_id);

  if (missingDuration.length > 0) {
    await enrichDurations(supabase, missingDuration);
    const { data: updated } = await supabase
      .from("youtube_videos")
      .select("video_id, duration_sec")
      .in("video_id", missingDuration);
    if (updated) {
      const durMap = new Map(
        (updated as Array<{ video_id: string; duration_sec: number | null }>).map(
          (u) => [u.video_id, u.duration_sec],
        ),
      );
      for (const c of candidates) {
        if (c.duration_sec == null && durMap.has(c.video_id)) {
          c.duration_sec = durMap.get(c.video_id) ?? null;
        }
      }
    }
  }

  // 3. Filter shorts. Videos with still-unknown duration are skipped
  // defensively — they'll be retried at the next tick once enrichDurations
  // catches them (or stay skipped if YouTube Data API never resolves them).
  const longEnough = candidates.filter(
    (c) => c.duration_sec != null && c.duration_sec >= MIN_DURATION_SEC,
  );
  const skippedShorts = candidates.length - longEnough.length;

  if (longEnough.length === 0) {
    console.log(
      `[cron-video-transcribe] All ${candidates.length} candidates were shorts or had unknown duration`,
    );
    return;
  }

  // 4. Bulk-load existing transcriptions to fast-skip already-done
  // (videoId, lang) buckets. Single round-trip — much cheaper than a
  // per-bucket cache check inside the loop.
  const { data: existingRaw, error: existingErr } = await supabase
    .from("video_transcriptions")
    .select("video_id, lang")
    .in("video_id", longEnough.map((c) => c.video_id))
    .in("lang", ["en", "fr"]);

  if (existingErr) {
    console.log(`[cron-video-transcribe] DB error (existing): ${existingErr.message}`);
    return;
  }

  const doneSet = new Set<string>();
  for (const r of existingRaw ?? []) {
    const row = r as { video_id: string; lang: string };
    doneSet.add(`${row.video_id}|${row.lang}`);
  }

  console.log(
    `[cron-video-transcribe] candidates=${candidates.length} long_enough=${longEnough.length} shorts_skipped=${skippedShorts} already_done_buckets=${doneSet.size}`,
  );

  // 5. Loop. Process the first lang of a video first (full pipeline), then
  // the second (translate path) — this ordering means the second lang
  // always benefits from the just-written alt-lang cache row.
  let processedBuckets = 0;
  let okCount = 0;
  let cachedCount = 0;
  let noTranscriptCount = 0;
  let timeoutCount = 0;
  let errorCount = 0;
  let cappedReached = false;

  outer: for (const c of longEnough) {
    for (const lang of ALL_LANGS) {
      if (doneSet.has(`${c.video_id}|${lang}`)) continue;

      if (remaining() <= SAFETY_MS) {
        lines.push(`[budget] stopping — remaining=${Math.max(0, remaining())}ms`);
        break outer;
      }
      if (processedBuckets >= MAX_BUCKETS_PER_RUN) {
        cappedReached = true;
        lines.push(`[cap] stopping — processed=${processedBuckets} max=${MAX_BUCKETS_PER_RUN}`);
        break outer;
      }

      processedBuckets++;

      try {
        const result = await transcribeVideo(
          c.video_id,
          lang,
          { title: c.title ?? undefined, channelId: c.channel_id },
          {
            openaiTimeoutMs: CRON_OPENAI_TIMEOUT_MS,
            model: CRON_AI_MODEL,
            // v2.10.3+ — only the cron writes bullets; user-triggered
            // routes leave the default `false` so a click never adds
            // a row. The cron is the canonical writer for `'video'`.
            persistBullets: true,
          },
        );
        switch (result.status) {
          case "ok":
            okCount++;
            doneSet.add(`${c.video_id}|${lang}`);
            lines.push(`[ok] video=${c.video_id} lang=${lang}`);
            break;
          case "cached":
            // Shouldn't happen since we pre-filtered via doneSet, but
            // defensive — concurrent ticks could race.
            cachedCount++;
            doneSet.add(`${c.video_id}|${lang}`);
            break;
          case "no_transcript":
            noTranscriptCount++;
            lines.push(`[no_transcript] video=${c.video_id} lang=${lang}`);
            break;
          case "ai_timeout":
            timeoutCount++;
            lines.push(`[ai_timeout] video=${c.video_id} lang=${lang} — ${result.errorMessage ?? ""}`);
            break;
          case "ai_error":
          case "rate_limit":
          case "no_openai":
          case "db_error":
          case "bad_input":
            errorCount++;
            lines.push(`[error] video=${c.video_id} lang=${lang} status=${result.status} — ${result.errorMessage ?? ""}`);
            break;
        }
      } catch (e) {
        errorCount++;
        const msg = e instanceof Error ? e.message : "unknown";
        lines.push(`[error] video=${c.video_id} lang=${lang} thrown — ${msg}`);
        console.log(`[cron-video-transcribe] Error: video=${c.video_id} lang=${lang} — ${msg}`);
      }
    }
  }

  // 6. v2.10.3+ — Backfill pass for transcriptions that exist without
  // any `summary_bullets` row. Covers two cases:
  //   - User-triggered transcriptions (`/api/youtube-channels/transcribe`,
  //     prewarm GET) now write only `video_transcriptions`, bullets are
  //     fan-out asynchronously here.
  //   - Legacy rows from before mig 014 / before this cleanup ever ran.
  // The pass is best-effort: capped at BACKFILL_BATCH per tick, skipped
  // entirely if the regular loop above ate most of the budget.
  let backfillScanned = 0;
  let backfillWrote = 0;
  let backfillSkippedNoBullets = 0;
  let backfillErrors = 0;
  if (remaining() > BACKFILL_MIN_REMAINING_MS) {
    try {
      // Fetch the newest transcriptions with their bullet ids embedded
      // and keep only the ones with ZERO bullets (filtered in JS).
      //
      // The previous `.is("summary_bullets.id", null)` filter was a
      // broken anti-join: PostgREST applies embedded-column filters to
      // the EMBEDDED rows, not the parent rows, so every tick returned
      // the 50 newest transcriptions regardless of bullet count and
      // rewrote their bullets (delete+insert) — pure churn, and the
      // trigger for the v2.13 podcast video-bullet wipe (see
      // `insertVideoBullets`). The proper PostgREST anti-join
      // (`!left` + `.is(embed, null)`) times out on this table, so we
      // filter client-side instead.
      const { data: newestRaw, error: missingErr } = await supabase
        .from("video_transcriptions")
        .select(
          "id, video_id, topic_id, lang, summary_md, published_date, title, summary_bullets(id)",
        )
        .order("id", { ascending: false })
        .limit(BACKFILL_BATCH);
      const missingRaw = (newestRaw ?? []).filter(
        (r) => ((r as { summary_bullets?: Array<{ id: number }> }).summary_bullets ?? []).length === 0,
      );
      if (missingErr) {
        lines.push(`[backfill] DB error: ${missingErr.message}`);
      } else if (missingRaw && missingRaw.length > 0) {
        // Pre-load `channel_title` for the affected videos in one
        // round-trip so `buildVideoBulletRows` can populate
        // `refs[0].source` with the publisher name.
        const videoIds = Array.from(
          new Set((missingRaw as Array<{ video_id: string }>).map((r) => r.video_id)),
        );
        const channelTitleByVideoId = new Map<string, string>();
        if (videoIds.length > 0) {
          const { data: vids } = await supabase
            .from("youtube_videos")
            .select("video_id, channel_title, title")
            .in("video_id", videoIds);
          for (const v of (vids ?? []) as Array<{
            video_id: string;
            channel_title: string | null;
            title: string | null;
          }>) {
            if (v.channel_title) channelTitleByVideoId.set(v.video_id, v.channel_title);
          }
        }

        for (const row of missingRaw as Array<{
          id: number;
          video_id: string;
          topic_id: string | null;
          lang: "en" | "fr";
          summary_md: string | null;
          published_date: string | null;
          title: string | null;
        }>) {
          if (remaining() <= BACKFILL_MIN_REMAINING_MS) {
            lines.push("[backfill] budget cut — stopping");
            break;
          }
          backfillScanned++;
          if (!row.summary_md) {
            backfillSkippedNoBullets++;
            continue;
          }
          const rows = buildVideoBulletRows({
            transcriptionId: row.id,
            topicId: row.topic_id,
            lang: row.lang,
            videoId: row.video_id,
            videoTitle: row.title ?? "Untitled",
            channelTitle: channelTitleByVideoId.get(row.video_id) ?? null,
            publishedDate: row.published_date,
            summaryMd: row.summary_md,
          });
          if (rows.length === 0) {
            backfillSkippedNoBullets++;
            continue;
          }
          const ok = await insertVideoBullets(rows);
          if (ok) {
            backfillWrote++;
          } else {
            backfillErrors++;
            lines.push(`[backfill] insert failed for transcription_id=${row.id}`);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      lines.push(`[backfill] threw — ${msg}`);
    }
  } else {
    lines.push(`[backfill] skipped — remaining=${remaining()}ms`);
  }

  const summary = `[run] cron=video-transcribe window=${WINDOW_HOURS}h candidates=${candidates.length} long_enough=${longEnough.length} shorts_skipped=${skippedShorts} processed=${processedBuckets} ok=${okCount} cached=${cachedCount} no_transcript=${noTranscriptCount} timeout=${timeoutCount} errors=${errorCount} capped=${cappedReached} backfill_scanned=${backfillScanned} backfill_wrote=${backfillWrote} backfill_no_bullets=${backfillSkippedNoBullets} backfill_errors=${backfillErrors} elapsed_ms=${elapsedMs()}`;
  lines.push(summary);
  console.log(lines.join("\n"));
  console.log(summary);

  // Per-video errors are routine (TranscriptAPI 408s, transient
  // timeouts) and the 15-min cadence retries them naturally — only a
  // run where EVERYTHING failed signals a real outage (dead API key,
  // quota exhausted, schema drift), so that's the alert threshold.
  if (errorCount > 0 && okCount === 0 && cachedCount === 0) {
    await sendCronAlert(
      "video-transcribe",
      summary,
      lines.filter((l) => l.includes("error") || l.includes("threw")),
    );
  }
};
