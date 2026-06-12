import { createClient } from "@supabase/supabase-js";
import { todayUtc } from "../../src/lib/dates-utc";
import {
  evaluateWatchdog,
  FETCH_STALE_MINUTES,
  type WatchdogSnapshot,
} from "../../src/lib/watchdog-checks";
import { startCronRun } from "./shared/cron-log";
import { sendCronAlert } from "./shared/cron-alert";

/**
 * Freshness watchdog — checks that the pipelines' OUTPUT data is fresh
 * and emails the operator (`ALERT_EMAIL_TO`) when it isn't. This is the
 * complement of the end-of-run error alerts wired into each cron: those
 * catch « the cron reported an error », this catches « the cron looked
 * fine but the user-visible data is stale » (the Daily-Podcast-stuck-
 * on-yesterday class of bug).
 *
 * Checks (pure logic + thresholds in `src/lib/watchdog-checks.ts`):
 *   1. `top_summaries` has today's UTC row for BOTH langs (after 04:00 UTC).
 *   2. At least one active topic was fetched in the last 60 min.
 *   3. No large (> 200) backlog of articles unscored for > 60 min while
 *      the scoring stamp is itself stale.
 *   4. At least one video transcription landed in the last 36 h.
 *
 * Scheduling: cron-job.org, timezone UTC, hourly (`0 * * * *`) →
 *   https://8news.ai/.netlify/functions/cron-watchdog
 * Synchronous function (a handful of indexed reads, well under the 30 s
 * limit). Stateless: while a problem persists, each hourly tick re-sends
 * the alert — acceptable nagging for a solo operator; lower the
 * cron-job.org frequency if it ever gets noisy.
 *
 * Response: 200 + `{ ok, problems }` JSON either way, so cron-job.org
 * shows green as long as the watchdog itself ran (the email is the
 * alert channel, not the HTTP status).
 */

export default async (): Promise<Response> => {
  const { log, elog, elapsedMs } = startCronRun("cron-watchdog");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    elog("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — aborting");
    return Response.json({ ok: false, problems: ["watchdog: supabase env missing"] });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const nowMs = Date.now();
  const today = todayUtc();
  const problems: string[] = [];

  try {
    const staleCutoff = new Date(nowMs - FETCH_STALE_MINUTES * 60_000).toISOString();

    const [podcastRes, topicsRes, backlogRes, transcriptionRes] = await Promise.all([
      supabase.from("top_summaries").select("lang").eq("summary_date", today),
      supabase
        .from("topics")
        .select("last_fetched_at, last_scored_at")
        .eq("is_active", true),
      supabase
        .from("articles")
        .select("id", { count: "exact", head: true })
        .is("relevance_score", null)
        .lt("fetched_at", staleCutoff),
      supabase
        .from("video_transcriptions")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    // A failing watchdog query is itself alert-worthy: it usually means
    // schema drift or an outage that also affects the app.
    for (const [name, res] of [
      ["top_summaries", podcastRes],
      ["topics", topicsRes],
      ["articles_backlog", backlogRes],
      ["video_transcriptions", transcriptionRes],
    ] as const) {
      if (res.error) {
        problems.push(`Watchdog : la requête ${name} a échoué — ${res.error.message}`);
      }
    }

    const maxMs = (values: (string | null)[]): number | null => {
      const ms = values
        .filter((v): v is string => v !== null)
        .map((v) => new Date(v).getTime())
        .filter((n) => Number.isFinite(n));
      return ms.length > 0 ? Math.max(...ms) : null;
    };

    const topics = (topicsRes.data ?? []) as {
      last_fetched_at: string | null;
      last_scored_at: string | null;
    }[];

    const snapshot: WatchdogSnapshot = {
      nowMs,
      todayUtc: today,
      podcastLangs: ((podcastRes.data ?? []) as { lang: string }[]).map((r) => r.lang),
      lastFetchedAtMs: maxMs(topics.map((t) => t.last_fetched_at)),
      lastScoredAtMs: maxMs(topics.map((t) => t.last_scored_at)),
      staleBacklogCount: backlogRes.count ?? 0,
      lastTranscriptionMs: maxMs(
        ((transcriptionRes.data ?? []) as { created_at: string | null }[]).map(
          (r) => r.created_at,
        ),
      ),
    };

    problems.push(...evaluateWatchdog(snapshot));
  } catch (fatal) {
    const msg = fatal instanceof Error ? (fatal.stack ?? fatal.message) : String(fatal);
    problems.push(`Watchdog : exception inattendue — ${msg}`);
  }

  const summary = `[run] cron=watchdog date=${today} problems=${problems.length} elapsed_ms=${elapsedMs()}`;
  if (problems.length > 0) {
    for (const p of problems) elog(`[problem] ${p}`);
    elog(summary);
    await sendCronAlert(
      "watchdog",
      `${problems.length} problème(s) de fraîcheur détecté(s) sur les pipelines 8news.`,
      problems,
    );
  } else {
    log(summary);
  }

  return Response.json({ ok: problems.length === 0, problems });
};
