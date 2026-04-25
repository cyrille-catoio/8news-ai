import { createClient } from "@supabase/supabase-js";
import { transcribeVideo } from "./shared/transcribe-video";
import { enrichDurations } from "../../src/lib/youtube-duration";

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
 *  longer per-call OpenAI timeout than the synchronous route. Bumped
 *  to 180s to comfortably accommodate `gpt-5.3-chat-latest` latency
 *  on long podcasts (typically 40-90s, but spikes happen). */
const CRON_OPENAI_TIMEOUT_MS = 180_000;

/** Higher-quality model for the pre-warm cache. The synchronous API
 *  route stays on `gpt-4.1-mini` (faster, predictable < 30 s) since
 *  it's only a fallback for very-fresh videos not yet picked up by a
 *  cron tick. Same model family already used by `/api/news/top-summary`
 *  and the per-topic video roundup. */
const CRON_AI_MODEL = "gpt-5.3-chat-latest";

const ALL_LANGS = ["en", "fr"] as const;

interface CandidateVideo {
  video_id: string;
  title: string | null;
  channel_id: string;
  duration_sec: number | null;
  published: string;
}

export default async () => {
  const startedAt = Date.now();
  const deadline = startedAt + Math.min(WALL_MS, BUDGET_MS);
  const remaining = () => deadline - Date.now();
  const lines: string[] = [];

  console.log("[cron-video-transcribe] Starting background function");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

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
          { openaiTimeoutMs: CRON_OPENAI_TIMEOUT_MS, model: CRON_AI_MODEL },
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

  const summary = `[run] cron=video-transcribe window=${WINDOW_HOURS}h candidates=${candidates.length} long_enough=${longEnough.length} shorts_skipped=${skippedShorts} processed=${processedBuckets} ok=${okCount} cached=${cachedCount} no_transcript=${noTranscriptCount} timeout=${timeoutCount} errors=${errorCount} capped=${cappedReached} elapsed_ms=${Date.now() - startedAt}`;
  lines.push(summary);
  console.log(lines.join("\n"));
  console.log(summary);
};
