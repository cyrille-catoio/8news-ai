import { todayUtc } from "../../src/lib/dates-utc";
import { getServerClient } from "../../src/lib/supabase/client";
import {
  evaluateWatchdog,
  missingPodcastLangs,
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
 * Self-heal (check 1 only): when today's snapshot is missing for a
 * lang, the watchdog doesn't just email — it re-triggers
 * `cron-top-summary-background?langs=<missing>` (fire-and-forget, the
 * background function ACKs 202 immediately) so the Daily Podcast
 * repairs itself within the hour whatever killed the 02:00 UTC tick
 * (transient DB/OpenAI error, wall-budget kill, cold-start crash).
 * Only the missing lang(s) are regenerated: the healthy lang's edition
 * is neither replaced nor re-billed. Convergent by construction: as
 * soon as the row lands, the next hourly tick stops re-triggering.
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

  // Shared cached service-role client (AGENTS.md § 6) — returns null
  // when the Supabase env vars are missing.
  const supabaseP = getServerClient();
  if (!supabaseP) {
    elog("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — aborting");
    return Response.json({ ok: false, problems: ["watchdog: supabase env missing"] });
  }
  const supabase = await supabaseP;

  const nowMs = Date.now();
  const today = todayUtc();
  const problems: string[] = [];
  // Operator-facing notes about self-heal actions taken this tick —
  // appended to the alert email detail, but NOT counted as problems.
  const healNotes: string[] = [];

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

    // Self-heal: re-trigger the top-summary cron for the missing
    // lang(s). Best-effort — a failed trigger must not take the
    // watchdog down, and the next hourly tick will retry anyway.
    const missing = missingPodcastLangs(snapshot);
    if (missing.length > 0) {
      const origin = process.env.URL?.trim() || "https://8news.ai";
      const healUrl = `${origin}/.netlify/functions/cron-top-summary-background?langs=${missing.join(",")}`;
      try {
        const res = await fetch(healUrl, {
          method: "GET",
          signal: AbortSignal.timeout(10_000),
        });
        const note = `Auto-réparation : cron-top-summary-background relancé pour langs=${missing.join(",")} (http=${res.status})`;
        healNotes.push(note);
        log(`[self-heal] ${note}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        problems.push(
          `Auto-réparation impossible : le déclenchement de cron-top-summary-background (langs=${missing.join(",")}) a échoué — ${msg}`,
        );
      }
    }
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
      [...problems, ...healNotes],
    );
  } else {
    log(summary);
  }

  return Response.json({ ok: problems.length === 0, problems, healNotes });
};
