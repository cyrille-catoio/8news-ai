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

/* ── Seen-Shorts tracking (localStorage, scoped to the day) ─────────── */

/**
 * localStorage key for the set of Shorts already watched TODAY. The feed
 * is newest-first; on reopen we drop the seen ones and show only the
 * unseen — still newest-first — so the viewer catches any Shorts that
 * appeared since (they sit at the top), skips everything already watched
 * (no duplicates), and works down to the older unseen ones, eventually
 * seeing every Short of the day exactly once. This supersedes a single
 * « last position » pointer, which broke as soon as new Shorts shifted
 * that position's index.
 */
export const SHORTS_SEEN_KEY = "shorts.seen.v1";

/** Safety cap on the stored set — a day's feed is ~100-150 Shorts, so
 *  this is never hit in practice; it just bounds localStorage if
 *  something ever loops. Oldest-seen ids are dropped first. */
export const SHORTS_SEEN_MAX = 600;

interface SeenRecord {
  /** Local calendar day the ids were collected on (YYYY-MM-DD). */
  date: string;
  ids: string[];
}

/**
 * Local calendar day key (YYYY-MM-DD) in the VIEWER's timezone — seen
 * tracking is deliberately scoped to « the same day », matching the
 * feed's own local-day window (`shortsWindowStartIso`). A set from an
 * earlier day is stale and ignored, so each new day starts fresh.
 */
export function shortsDayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parse the stored seen record into a Set — empty unless it is for
 * `todayKey`. Malformed / absent / stale storage yields an empty set,
 * so the viewer simply sees the whole day fresh.
 */
export function parseSeenIds(raw: string | null, todayKey: string): Set<string> {
  if (!raw) return new Set();
  try {
    const rec = JSON.parse(raw) as Partial<SeenRecord>;
    if (rec && rec.date === todayKey && Array.isArray(rec.ids)) {
      return new Set(
        rec.ids.filter((x): x is string => typeof x === "string" && x.length > 0),
      );
    }
  } catch {
    // malformed JSON — treat as nothing seen
  }
  return new Set();
}

/**
 * Serialize the seen set with `videoId` added (idempotent), stamped with
 * `todayKey` and capped to the most recent `SHORTS_SEEN_MAX` ids
 * (oldest-seen dropped first).
 */
export function serializeSeen(
  existing: Set<string>,
  videoId: string,
  todayKey: string,
): string {
  const ids = existing.has(videoId) ? [...existing] : [...existing, videoId];
  const capped = ids.length > SHORTS_SEEN_MAX ? ids.slice(ids.length - SHORTS_SEEN_MAX) : ids;
  return JSON.stringify({ date: todayKey, ids: capped } satisfies SeenRecord);
}

/**
 * The Shorts the viewer should actually see: the unseen ones, preserving
 * the API's newest-first order (new arrivals at the top, then older
 * unseen). When everything has already been seen — the viewer is caught
 * up for the day — returns the full list so the feed is never a dead
 * empty screen; the day simply restarts from the newest.
 */
export function selectUnseenShorts<T extends { videoId: string }>(
  list: T[],
  seen: Set<string>,
): T[] {
  const unseen = list.filter((v) => !seen.has(v.videoId));
  return unseen.length === 0 ? list : unseen;
}
