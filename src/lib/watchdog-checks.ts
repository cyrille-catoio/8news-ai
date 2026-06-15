/**
 * Pure evaluation logic for the freshness watchdog
 * (`netlify/functions/cron-watchdog.ts`). The cron gathers a snapshot
 * of the pipeline's output tables and this module decides — without any
 * I/O — which French problem strings to put in the operator alert email.
 *
 * Rationale: the worst production bugs so far were NOT crons crashing,
 * they were crons « succeeding » while the user-visible data stayed
 * stale (Daily Podcast stuck on yesterday, EN lang one edition behind).
 * End-of-run error alerts can't catch that class — only checking the
 * OUTPUT freshness can.
 */

/** The 02:00 UTC top-summary tick gets until 04:00 UTC (retries included)
 *  before a missing today-snapshot counts as an incident. */
export const PODCAST_GRACE_UTC_HOUR = 4;
/** Fetch cron runs every ~15 min; 60 min without ANY topic fetched = pipeline down. */
export const FETCH_STALE_MINUTES = 60;
/** Scoring cron runs every ~15 min; 30 min without a scoring stamp while
 *  backlog is high = pipeline down (not just slow). */
export const SCORE_STALE_MINUTES = 30;
/** Unscored articles sitting > 60 min, below this count = normal trickle. */
export const SCORE_BACKLOG_FLOOR = 200;
/** Subscribed channels publish daily; 36 h without any new transcription
 *  row = transcribe pipeline (or TranscriptAPI key) is dead. */
export const TRANSCRIBE_STALE_HOURS = 36;

export interface WatchdogSnapshot {
  /** Epoch ms of the check (injectable for tests). */
  nowMs: number;
  /** Today's UTC date (YYYY-MM-DD) — the expected `top_summaries.summary_date`. */
  todayUtc: string;
  /** Langs that have a `top_summaries` row for today. */
  podcastLangs: readonly string[];
  /** Langs that have at least one mirrored `summary_bullets` top50 row for today. */
  podcastBulletLangs: readonly string[];
  /** max(topics.last_fetched_at) over active topics, epoch ms. Null = never. */
  lastFetchedAtMs: number | null;
  /** max(topics.last_scored_at) over active topics, epoch ms. Null = never. */
  lastScoredAtMs: number | null;
  /** Articles with relevance_score IS NULL fetched more than 60 min ago. */
  staleBacklogCount: number;
  /** max(video_transcriptions.created_at), epoch ms. Null = never. */
  lastTranscriptionMs: number | null;
}

function ageMinutes(nowMs: number, thenMs: number | null): number {
  if (thenMs === null) return Number.POSITIVE_INFINITY;
  return (nowMs - thenMs) / 60_000;
}

function formatAge(minutes: number): string {
  if (!Number.isFinite(minutes)) return "jamais";
  if (minutes >= 120) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes)} min`;
}

/**
 * Langs whose today-snapshot is missing in `top_summaries` after the
 * grace hour ([] before it, or when all langs are present). Shared by
 * `evaluateWatchdog` (problem strings) and the watchdog cron's
 * SELF-HEAL: each missing lang triggers a re-run of
 * `cron-top-summary-background?langs=…`, so a failed 02:00 UTC tick is
 * repaired within the hour instead of leaving the day broken until a
 * manual replay (the recurring « EN podcast missing » incident).
 */
export function missingPodcastLangs(s: WatchdogSnapshot): ("en" | "fr")[] {
  const utcHour = new Date(s.nowMs).getUTCHours();
  if (utcHour < PODCAST_GRACE_UTC_HOUR) return [];
  return (["en", "fr"] as const).filter(
    (lang) => !s.podcastLangs.includes(lang) || !s.podcastBulletLangs.includes(lang),
  );
}

/** Returns one French problem string per failed check ([] = all green). */
export function evaluateWatchdog(s: WatchdogSnapshot): string[] {
  const problems: string[] = [];

  // 1. Daily Podcast snapshot (feeds home hero + newsletter + archives).
  //    Checked after the grace hour only, so the 02:00 UTC tick has time
  //    to run and retry before we declare the day broken.
  for (const lang of missingPodcastLangs(s)) {
    problems.push(
      `Podcast du jour absent ou incomplet : top_summaries/summary_bullets manquants pour ${s.todayUtc} lang=${lang} — vérifier cron-top-summary-background`,
    );
  }

  // 2. Fetch pipeline liveness.
  const fetchAge = ageMinutes(s.nowMs, s.lastFetchedAtMs);
  if (fetchAge > FETCH_STALE_MINUTES) {
    problems.push(
      `Pipeline de fetch arrêté : dernier fetch il y a ${formatAge(fetchAge)} (seuil ${FETCH_STALE_MINUTES} min) — vérifier cron-fetching-background`,
    );
  }

  // 3. Scoring pipeline liveness. Backlog alone isn't enough (a spike
  //    being absorbed is normal) — alert only when the backlog is high
  //    AND the scoring stamp is stale, i.e. nothing is absorbing it.
  const scoreAge = ageMinutes(s.nowMs, s.lastScoredAtMs);
  if (s.staleBacklogCount > SCORE_BACKLOG_FLOOR && scoreAge > SCORE_STALE_MINUTES) {
    problems.push(
      `Pipeline de scoring arrêté : ${s.staleBacklogCount} articles non scorés depuis plus de ${FETCH_STALE_MINUTES} min et dernier scoring il y a ${formatAge(scoreAge)} — vérifier cron-scoring-background`,
    );
  }

  // 4. Video transcription liveness.
  const transcribeAge = ageMinutes(s.nowMs, s.lastTranscriptionMs);
  if (transcribeAge > TRANSCRIBE_STALE_HOURS * 60) {
    problems.push(
      `Aucune transcription vidéo depuis ${formatAge(transcribeAge)} (seuil ${TRANSCRIBE_STALE_HOURS} h) — vérifier cron-video-transcribe-background et la clé TranscriptAPI`,
    );
  }

  return problems;
}
