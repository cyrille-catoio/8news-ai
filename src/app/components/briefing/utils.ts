/**
 * File-private utilities for the BriefingPage tree (home).
 *
 * Extracted v2.12 from the monolithic `BriefingPage.tsx` so the
 * orchestrator stays focused on hooks + composition. None of these
 * helpers carry state; moving them is byte-for-byte behavior-neutral.
 */

import { color } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";

/** Tier color for an inline 1-10 score badge. Mirrors `ScoreMeter`.
 *  Keep aligned with `ScoreMeter`'s tier ladder so an inline numeric
 *  badge and a ScoreMeter rendered side-by-side never disagree on
 *  color. v2.6.14+ green threshold lowered 9 → 8. */
export function scoreTierColor(score: number): string {
  if (score >= 8) return "#22c55e";
  if (score >= 5) return color.gold;
  if (score >= 3) return "#f97316";
  return "#ef4444";
}

/** Human-readable « X minutes ago » in EN/FR for a given pubDate. */
export function relativeTime(pubDate: string, lang: Lang): string {
  const ms = Date.now() - new Date(pubDate).getTime();
  if (ms < 0 || isNaN(ms)) return "";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return lang === "fr" ? "à l'instant" : "just now";
  if (minutes < 60) return lang === "fr" ? `il y a ${minutes} min` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return lang === "fr" ? `il y a ${hours} h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return lang === "fr" ? `il y a ${days} j` : `${days}d ago`;
}

/** Bullet shape returned by `GET /api/summaries/[topic]/[date]`. Mirror
 *  of the row stored in `daily_summaries.bullets`. */
export interface DailySummaryBullet {
  title?: string | null;
  text: string;
}

/** Builds a ~5-line teaser by concatenating the first 2-3 bullet texts
 *  (each one is ~80-150 chars on average) and capping at 420 chars so
 *  the card stays bounded. Falls back to a single bullet if the array
 *  is shorter; returns the raw `seo_description` when the bullets
 *  payload is missing entirely (legacy rows). */
export function buildSummaryTeaser(
  bullets: DailySummaryBullet[],
  seoDescription: string,
): string {
  const cleanBullets = (bullets ?? [])
    .map((b) => (typeof b?.text === "string" ? b.text.trim() : ""))
    .filter(Boolean);
  if (cleanBullets.length === 0) return seoDescription.trim();
  const joined = cleanBullets.slice(0, 3).join(" ");
  if (joined.length <= 420) return joined;
  const cut = joined.slice(0, 420);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 320 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}
