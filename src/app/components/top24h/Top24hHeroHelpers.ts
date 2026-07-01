import { type Lang, dateLocale } from "@/lib/i18n";

/**
 * Pure helpers used by `Top24hHero` — bullet grouping, group counting,
 * and the day-label formatter for the history arrows.
 *
 * v2.12 extracted from `src/app/components/Top24hHero.tsx`. The
 * `Bullet` and `Group` shapes live here too so the helpers stay
 * portable.
 */

export interface Bullet {
  text: string;
  title?: string | null;
  refs: Array<{ title: string; link: string; source: string }>;
  /**
   * Editorial importance 1-10 propagated from the LLM `importance`
   * field per group (mig. 026+, exposed by `/api/news/top-summary/latest`
   * since v2.6.9). All bullets of a same-title run share the same value
   * so the renderer can read it from `group.bullets[0]`. NULL on legacy
   * snapshots and on environments where mig. 026 hasn't been applied —
   * the meter is hidden in that case.
   */
  importanceScore?: number | null;
  /**
   * « Top videos of yesterday » bullets pinned at the head of the
   * Daily Podcast (v2.13+). Hoisted before every article group by
   * `groupBullets` and rendered with a VIDEO badge; their single ref
   * deep-links to the per-video SSR page (full AI summary + player).
   * Absent/false on regular article bullets and legacy snapshots.
   */
  isVideo?: boolean;
}

export interface Group {
  /** Empty string means « no title » (legacy bullets) — rendered as a
   *  plain non-collapsible row. */
  title: string;
  bullets: Bullet[];
}

/** Fold consecutive bullets that share the same title into a single
 *  thematic group. Bullets without a title each become their own
 *  empty-titled group so they keep their place in the list without
 *  pretending to be collapsible.
 *
 *  v2.6.13+ groups are then sorted by descending `importanceScore`
 *  (first bullet of each group, which carries the LLM's group-level
 *  score thanks to the flatten in `ai-analyze.ts`). Bullets without
 *  a score fall back to 0 → drift to the bottom. Bullet order WITHIN
 *  a group is preserved (it's a narrative, not a ranking). The sort
 *  is stable so equal-score groups keep their LLM emission order. */
export function groupBullets(bullets: Bullet[]): Group[] {
  const out: Group[] = [];
  for (const b of bullets) {
    const t = (b.title ?? "").trim();
    if (!t) {
      out.push({ title: "", bullets: [b] });
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.title === t) last.bullets.push(b);
    else out.push({ title: t, bullets: [b] });
  }
  // Stable sort by importance DESC only (v2.16.2+): video groups are no
  // longer pinned at the head — they interleave with article groups
  // purely by score, per product direction. Legacy groups without a
  // score (NULL on snapshots predating mig 026) treat as 0 so they sink
  // below scored groups instead of arbitrarily intermixing. Stable sort
  // keeps equal-score groups in LLM emission order.
  const decorated = out.map((g, i) => ({
    g,
    i,
    s: g.bullets[0]?.importanceScore ?? 0,
  }));
  decorated.sort((a, b) => (b.s - a.s) || (a.i - b.i));
  return decorated.map((d) => d.g);
}

/** Number of groups produced by `groupBullets` without allocating the
 *  full Group array — useful to size the initial `openIdx` Set when
 *  `defaultOpen` is true (the actual array gets built once below). */
export function countGroups(bullets: Bullet[]): number {
  let n = 0;
  let prev: string | null = null;
  for (const b of bullets) {
    const t = (b.title ?? "").trim();
    if (!t) {
      n += 1;
      prev = null;
      continue;
    }
    if (t !== prev) {
      n += 1;
      prev = t;
    }
  }
  return n;
}

/** Day label rendered in the Daily Podcast title (home hero) and next
 *  to the kicker when navigating previous snapshots. The weekday is
 *  spelled out in full in both languages (« mercredi 5 mai 2026 » /
 *  « Wednesday, May 5, 2026 ») — no abbreviations. */
export function formatSummaryDayLabel(dateISO: string, lang: Lang): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  return new Intl.DateTimeFormat(dateLocale(lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}
