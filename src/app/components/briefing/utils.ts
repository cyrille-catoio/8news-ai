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

/** True when `pubDate` is within the last `withinHours` hours (default
 *  3) — drives the « NEW » freshness badge on the home so a daily
 *  reader spots what landed since this morning at a glance. */
export function isFresh(pubDate: string, withinHours = 3): boolean {
  const ms = Date.now() - new Date(pubDate).getTime();
  return ms >= 0 && ms < withinHours * 3_600_000;
}

/**
 * Picks which daily-summary route the home should surface. Routes arrive
 * from `/api/summaries/routes` already sorted by `summary_date` DESC, so
 * "the first match" is always the most recent one.
 *
 * - Filters to the current UI language first.
 * - When `preferredTopicId` is set and that topic has a recent summary,
 *   returns it (the user's chosen topic).
 * - Otherwise falls back to the most recent summary across all topics, so
 *   the section never goes blank (guests, no preference, or preferred
 *   topic without a fresh summary).
 */
export function selectPreferredSummaryRoute<T extends { topic_id: string; lang: string }>(
  routes: T[],
  lang: Lang,
  preferredTopicId: string | null | undefined,
): T | null {
  const langRoutes = routes.filter((r) => r.lang === lang);
  if (preferredTopicId) {
    const preferred = langRoutes.find((r) => r.topic_id === preferredTopicId);
    if (preferred) return preferred;
  }
  return langRoutes[0] ?? null;
}

/** Bullet shape returned by `GET /api/summaries/[topic]/[date]`. Mirror
 *  of the row stored in `daily_summaries.bullets`. */
export interface DailySummaryBullet {
  title?: string | null;
  text: string;
}

/** How many summary bullets the home teaser shows. The card mirrors the
 *  « Points clés » list of the full summary page instead of a joined
 *  paragraph (owner request, replaces the 840-char `buildSummaryTeaser`
 *  concatenation). */
const TEASER_BULLET_COUNT = 2;

/** Returns the first bullet texts to render as the home teaser list.
 *  Falls back to the raw `seo_description` as a single entry when the
 *  bullets payload is missing entirely (legacy rows); empty array when
 *  there is nothing to show. */
export function buildTeaserBullets(
  bullets: DailySummaryBullet[],
  seoDescription: string,
): string[] {
  const cleanBullets = (bullets ?? [])
    .map((b) => (typeof b?.text === "string" ? b.text.trim() : ""))
    .filter(Boolean);
  if (cleanBullets.length === 0) {
    const seo = seoDescription.trim();
    return seo ? [seo] : [];
  }
  return cleanBullets.slice(0, TEASER_BULLET_COUNT);
}
