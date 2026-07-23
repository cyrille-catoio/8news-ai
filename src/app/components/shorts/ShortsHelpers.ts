import { t, type Lang } from "@/lib/i18n";

/**
 * Pure helpers for the Shorts feed (`ShortsPage.tsx`, the TikTok-style
 * vertical player behind the « Shorts » general-menu pill). Window
 * computation, day labels, embed-URL building and index clamping live
 * here so they stay unit-testable without a DOM.
 */

/** Rolling feed window: today + the 4 previous local calendar days. */
export const SHORTS_WINDOW_DAYS = 5;

/** Same threshold as the transcribe cron: a « Short » is < 180 s. */
export const SHORT_MAX_DURATION_SEC = 180;

/**
 * A row qualifies for the feed only when its duration is known AND
 * strictly under the Short threshold — unknown duration is NOT a Short
 * (mirrors `isShortVideo` in `VideosPage.tsx`).
 */
export function isShortDuration(durationSec: number | null | undefined): boolean {
  return durationSec != null && durationSec > 0 && durationSec < SHORT_MAX_DURATION_SEC;
}

/**
 * ISO instant of local midnight `days - 1` days ago — the feed's lower
 * bound, computed CLIENT-side so « today / yesterday » follow the
 * viewer's clock, not UTC (same concern as the `?tz=` handling in
 * `GET /api/youtube-channels/videos`).
 */
export function shortsWindowStartIso(now: Date, days: number = SHORTS_WINDOW_DAYS): string {
  const safeDays = Math.max(1, Math.floor(days));
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (safeDays - 1));
  return start.toISOString();
}

/**
 * Slide day chip: « Today » / « Yesterday » (bilingual via i18n keys),
 * else a short localized date (« July 18 » / « 18 juillet »). Compared
 * on local calendar days of the viewer.
 */
export function shortsDayLabel(publishedIso: string, now: Date, lang: Lang): string {
  const published = new Date(publishedIso);
  if (isNaN(published.getTime())) return "";
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((dayStart(now) - dayStart(published)) / 86_400_000);
  if (diffDays <= 0) return t("shortsToday", lang);
  if (diffDays === 1) return t("shortsYesterday", lang);
  return published.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
    day: "numeric",
    month: "long",
  });
}

/**
 * Embed URL for one Short. Autoplay always starts MUTED (the only
 * autoplay browsers reliably allow); the player is then unmuted via the
 * iframe JS API when the user has sound on. `loop=1&playlist={id}`
 * replays the Short endlessly, TikTok-style. `enablejsapi=1` is
 * required for the tap-to-pause / mute postMessage commands; `origin`
 * is only attached off-localhost, mirroring the caution in
 * `VideoCard.tsx` (YouTube embeds are picky with 127.0.0.1 origins).
 */
export function buildShortsEmbedUrl(
  videoId: string,
  opts: { isLocal: boolean; origin?: string | null },
): string {
  const host = opts.isLocal ? "https://www.youtube-nocookie.com" : "https://www.youtube.com";
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    controls: "0",
    fs: "0",
    iv_load_policy: "3",
    loop: "1",
    playlist: videoId,
    enablejsapi: "1",
  });
  if (!opts.isLocal && opts.origin) params.set("origin", opts.origin);
  return `${host}/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}

/** Clamp a target slide index into [0, total). Empty feed pins to 0. */
export function clampShortsIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, index));
}

/** « 3 / 42 » position label (top bar + aria-live). */
export function shortsCounterLabel(position: number, total: number): string {
  return `${position} / ${total}`;
}

/** Compact M:SS duration chip (Shorts never reach the hour). */
export function formatShortDuration(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ── Resume-where-you-left-off (localStorage, scoped to the day) ────── */

/** localStorage key holding the last-watched Short for the current day. */
export const SHORTS_RESUME_KEY = "shorts.lastWatched.v1";

interface ResumeRecord {
  /** Local calendar day the Short was watched on (YYYY-MM-DD). */
  date: string;
  videoId: string;
}

/**
 * Local calendar day key (YYYY-MM-DD) in the VIEWER's timezone — resume
 * is deliberately scoped to « the same day », matching the feed's own
 * local-day window (`shortsWindowStartIso`). A stored Short from an
 * earlier day is stale and ignored, so each new day starts fresh on the
 * most recent Short.
 */
export function shortsDayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parse a stored resume record and return its videoId ONLY when it was
 * saved on `todayKey`. Returns null for anything stale, absent or
 * malformed — the caller then falls back to the newest Short.
 */
export function parseResumeVideoId(raw: string | null, todayKey: string): string | null {
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw) as Partial<ResumeRecord>;
    if (
      rec &&
      rec.date === todayKey &&
      typeof rec.videoId === "string" &&
      rec.videoId.length > 0
    ) {
      return rec.videoId;
    }
  } catch {
    // malformed JSON — treat as no saved position
  }
  return null;
}

/** Serialize the resume record written to localStorage on each slide change. */
export function serializeResume(videoId: string, todayKey: string): string {
  return JSON.stringify({ date: todayKey, videoId } satisfies ResumeRecord);
}
