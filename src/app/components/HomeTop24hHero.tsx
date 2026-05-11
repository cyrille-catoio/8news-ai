"use client";

import { t, type Lang } from "@/lib/i18n";
import type { AppNavPage } from "@/app/components/AppHeader";
import { Top24hHero } from "@/app/components/Top24hHero";

/**
 * Home-specific wrapper around the shared `<Top24hHero>` base
 * (v2.6.12+).
 *
 * Why a thin wrapper rather than just inlining `<Top24hHero>` with
 * props? The home and the dedicated `/top-articles` surface used to
 * read identically (same component, same props), but the editorial
 * direction is starting to diverge — the home reads as « Podcast du
 * jour » (audio-first framing reinforced by the player above the
 * accordion), while `/top-articles` is the « full briefing » surface
 * with every group open by default. Splitting the consumers into
 * dedicated wrappers means future edits to either surface (extra
 * sections, different chrome, A/B copy) won't churn the other.
 *
 * Home defaults baked in here:
 *   - **Self-fetched** snapshot (no `data` prop — the base does the
 *     `/api/news/top-summary/latest` call on mount and on `lang`
 *     change).
 *   - **Collapsed accordion** (`defaultOpen={false}` — the visitor
 *     scans headlines and expands what catches their eye).
 *   - **« Read full briefing → » footer link** kept (`showSeeAllLink`
 *     defaults to true on the base) so a click navigates to
 *     `/top-articles` for the deep dive.
 *   - **Title « Podcast du jour »** via `t("top24hHeroHomeTitle")`,
 *     suffixed with ` — {summaryDate}` from the loaded snapshot.
 */
export function HomeTop24hHero({
  lang,
  onNavigate,
}: {
  lang: Lang;
  onNavigate: (page: AppNavPage) => void;
}) {
  return (
    <Top24hHero
      lang={lang}
      onNavigate={onNavigate}
      title={t("top24hHeroHomeTitle", lang)}
      appendSummaryDateToTitle
    />
  );
}
