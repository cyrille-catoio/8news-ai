"use client";

import { t, type Lang } from "@/lib/i18n";
import { Top24hHero } from "@/app/components/Top24hHero";

/**
 * Dedicated `/top-articles` wrapper around the shared `<Top24hHero>`
 * base (v2.6.12+).
 *
 * The `/top-articles` surface differs from the home `<HomeTop24hHero>`:
 *   - Receives its `data` from the parent (the SPA fetches
 *     `/api/news/top-summary/latest` once and feeds both this card
 *     and its sibling 50-article list, no double network call).
 *   - Opens **every group** up front (`defaultOpen={true}`) — the
 *     visitor came here explicitly for the « full briefing »
 *     experience the previous `SummaryBox`-driven surface had.
 *   - **Hides** the « Read full briefing → » footer link
 *     (`showSeeAllLink={false}`) which would loop back to the same
 *     route.
 *   - Title stays « Top articles 24h » via `t("top24hHeroTitle")`.
 *
 * Splitting the wrapper from the home one means we can A/B copy or
 * add a brief / sources tab toggle here later without affecting the
 * home card.
 */
export function TopArticlesTop24hHero({
  lang,
  data,
}: {
  lang: Lang;
  /**
   * Parent-fetched snapshot. `null` for « no snapshot yet » (the base
   * hides the card silently in that case). `undefined` would trigger
   * the base's self-fetch path which we deliberately never want
   * here — pass `null` instead when the data isn't ready.
   */
  data: Parameters<typeof Top24hHero>[0]["data"];
}) {
  return (
    <Top24hHero
      lang={lang}
      data={data}
      defaultOpen
      showSeeAllLink={false}
      title={t("top24hHeroTitle", lang)}
    />
  );
}
