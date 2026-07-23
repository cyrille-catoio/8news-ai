"use client";

import { t, type Lang } from "@/lib/i18n";
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
 * accordion), while `/top-articles` is the « full briefing » surface.
 * Splitting the consumers into dedicated wrappers means future edits
 * to either surface (extra sections, different chrome, A/B copy)
 * won't churn the other.
 *
 * Home defaults baked in here:
 *   - **Self-fetched** snapshot (no `data` prop — the base does the
 *     `/api/news/top-summary/latest` call on mount and on `lang`
 *     change).
 *   - **Fully expanded accordion** (`defaultOpen` — the visitor lands
 *     on the whole briefing; individual groups stay collapsible).
 *   - **« Ask the AI » footer button** (`onOpenChat`) opening the Daily
 *     Podcast chat grounded in today's briefing. The former « See all
 *     articles → » footer link was removed in v2.19.
 *   - **Title « Podcast du jour »** via `t("top24hHeroHomeTitle")`,
 *     suffixed with ` — {summaryDate}` from the loaded snapshot.
 *
 * The per-snapshot « Lu / Read » checkbox (v2.8.2 → v2.20) was removed:
 * the podcast now always renders expanded. The `user_activity` API and
 * table remain in place for future client-side toggles.
 */
export function HomeTop24hHero({
  lang,
  onOpenChat,
}: {
  lang: Lang;
  /** Opens the Daily Podcast chat (grounded in today's briefing). */
  onOpenChat?: () => void;
}) {
  return (
    <Top24hHero
      lang={lang}
      onOpenChat={onOpenChat}
      title={t("top24hHeroHomeTitle", lang)}
      kickerLabel={t("top24hHeroHomeTitle", lang)}
      appendSummaryDateToTitle
      hideTitlePrefix
      defaultOpen
      showHistoryControls
      showHomeRefresh
      showReaderButton
    />
  );
}
