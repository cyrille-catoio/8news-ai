/**
 * Tiny stale-while-revalidate cache for the `<Top24hHero>` self-fetch
 * snapshot. The `/api/news/top-summary/latest` endpoint stays in
 * `force-dynamic` + `no-store` mode (Netlify CDN had a path-level
 * cache-key bug when `s-maxage` was set — see the route file for
 * details), so we can't lean on the CDN/browser fetch cache here.
 *
 * The strategy is purely client-side:
 *   1. On mount, `Top24hHero` reads any previously cached snapshot for
 *      `(lang, offset)` synchronously from `localStorage` and renders it
 *      immediately — no spinner if we have anything fresh-ish to show.
 *   2. The component still kicks off the live `fetch()` in the
 *      background; when it returns, the snapshot is silently replaced
 *      and the cache is rewritten.
 *
 * `localStorage` (not session) so a returning visitor gets the instant
 * render too. The TTL is a defensive guard against showing a multi-day-
 * old snapshot if the network call fails right after a long absence —
 * the background revalidation always corrects the stale value when the
 * network is healthy.
 */

import type { Lang } from "@/lib/i18n";
import { todayUtc } from "@/lib/dates-utc";

const KEY_PREFIX = "top24h-snapshot:";
const TTL_MS = 24 * 60 * 60 * 1000;
const SCHEMA = 1;

interface Envelope<T> {
  /** Bumped whenever the cached payload shape changes — old envelopes
   *  with a different `schema` are treated as a miss so we never
   *  hydrate the UI from a now-incompatible payload. */
  schema: number;
  /** `Date.now()` at write time. Used to TTL-evict entries older than
   *  `TTL_MS`. */
  ts: number;
  data: T;
}

function key(lang: Lang, offset: number): string {
  return `${KEY_PREFIX}${lang}:${offset}`;
}

type CachedSnapshot = { summaryDate?: string };

export function readCachedSnapshot<T extends CachedSnapshot>(
  lang: Lang,
  offset: number,
): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(lang, offset));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (parsed.schema !== SCHEMA) return null;
    if (Date.now() - parsed.ts > TTL_MS) return null;
    // Offset 0 is « today's live podcast ». A cached row keyed on a
    // past `summaryDate` paints yesterday instantly and can hide a
    // freshly-written row until TTL expiry — drop it when the UTC day
    // rolled over (the live fetch still falls back when today's cron
    // row is missing).
    if (
      offset === 0 &&
      parsed.data.summaryDate &&
      parsed.data.summaryDate !== todayUtc()
    ) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeCachedSnapshot<T>(lang: Lang, offset: number, data: T): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: Envelope<T> = { schema: SCHEMA, ts: Date.now(), data };
    window.localStorage.setItem(key(lang, offset), JSON.stringify(envelope));
  } catch {
    /* quota / disabled storage — silent ignore, SWR still works without persistence */
  }
}
