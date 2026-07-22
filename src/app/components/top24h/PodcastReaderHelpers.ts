import {
  groupBullets,
  type Bullet,
  type Group,
} from "@/app/components/top24h/Top24hHeroHelpers";

/**
 * Pure helpers for the fullscreen Daily Podcast reader
 * (`PodcastReader.tsx`) — page construction from the flat bullet list,
 * navigation clamping, and the « i / N » counter label.
 *
 * One page per thematic group produced by `groupBullets` (same
 * grouping + importance-DESC ordering as the home accordion, so the
 * reading order matches what the visitor already saw collapsed). The
 * first slide IS the first news — no cover page; the « Podcast du
 * jour » + date context lives in the reader's fixed header instead.
 */

export interface ReaderPage {
  group: Group;
  /** 1-based position (for the « 3 / 8 » kicker). */
  index: number;
  /** Total number of pages. */
  total: number;
}

/** One page per thematic group. Returns `[]` when there are no groups
 *  at all so the caller can skip opening the reader. */
export function buildReaderPages(bullets: Bullet[]): ReaderPage[] {
  const groups = groupBullets(bullets);
  const total = groups.length;
  return groups.map((group, i) => ({ group, index: i + 1, total }));
}

/** Clamp a requested page index into `[0, total - 1]`. `total <= 0`
 *  collapses to 0 so the caller never scrolls to a negative offset. */
export function clampPageIndex(next: number, total: number): number {
  if (total <= 0) return 0;
  if (next < 0) return 0;
  if (next > total - 1) return total - 1;
  return next;
}

/** « 3 / 8 » label shown in the reader's bottom bar and on each group
 *  slide kicker. `index` is 1-based. */
export function readerCounterLabel(index: number, total: number): string {
  return `${index} / ${total}`;
}
