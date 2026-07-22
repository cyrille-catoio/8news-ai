"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { color } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import type { AppNavPage } from "@/app/components/AppHeader";
import { trackEvent } from "@/lib/track";

/* ── Shared styles ─────────────────────────────────────────────────── */

const barWrap: CSSProperties = {
  marginBottom: 30,
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

// v2.11.2+ — pills default to gold-on-black (gold border, gold text,
// solid black background). Selected pill inverts to gold-on-black-text
// (gold fill, black text). This single-token treatment matches the
// rest of the home's gold-bordered card family and gives the active
// pill an unambiguous filled affordance.
const base: CSSProperties = {
  border: `1px solid ${color.gold}`,
  background: "#000",
  color: color.gold,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  padding: "6px 14px",
  // Floor keeps the shortest labels (Vidéos, Topics) visually balanced
  // next to the longest ones without forcing every pill to the same
  // width — content-sized nav remains the intent.
  minWidth: 72,
  textAlign: "center",
  borderRadius: 999,
  fontFamily: "inherit",
  transition: "all .15s ease",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const activeStyle: CSSProperties = {
  ...base,
  background: color.gold,
  color: "#000",
};

/** Public general-menu slots shared by SPA + SSR chrome. Keeping one
 *  ordered list is what stops the two surfaces from drifting (e.g. the
 *  missing « Chaînes YT » pill on SEO article pages). */
type GeneralMenuItemId =
  | "briefing"
  | "home"
  | "videos"
  | "shorts"
  | "channels"
  | "cryptoChart"
  | "summaries"
  | "favorites";

type GeneralMenuItem = {
  id: GeneralMenuItemId;
  labelKey:
    | "briefingBtn"
    | "generalMenuArticlesBtn"
    | "videosBtn"
    | "shortsBtn"
    | "channelsBtn"
    | "cryptoMenuBtn"
    | "dailySummaryBtn"
    | "myFavoritesBtn";
  /** Default href used by the SSR menu (and by SPA for non-special items). */
  href: string;
};

const GENERAL_MENU_ITEMS: readonly GeneralMenuItem[] = [
  { id: "briefing", labelKey: "briefingBtn", href: "/app" },
  { id: "home", labelKey: "generalMenuArticlesBtn", href: "/app/articles" },
  { id: "videos", labelKey: "videosBtn", href: "/app/videos" },
  { id: "shorts", labelKey: "shortsBtn", href: "/app/shorts" },
  { id: "channels", labelKey: "channelsBtn", href: "/app/channels" },
  { id: "cryptoChart", labelKey: "cryptoMenuBtn", href: "/app/crypto-chart?coin=bitcoin&symbol=btc" },
  // Archives: SSR points at the public hub; SPA navigates in-app via callback.
  { id: "summaries", labelKey: "dailySummaryBtn", href: "/archives" },
  { id: "favorites", labelKey: "myFavoritesBtn", href: "/app/favorites" },
];

/* ── SPA version (used in page.tsx) ────────────────────────────────── */

export function GeneralMenu({
  lang,
  currentPage,
  isAuthenticated,
  onNavigateBriefing,
  onNavigateHome,
  onNavigateFavorites,
  onNavigateCrypto,
  onNavigateSummaries,
  onNavigateVideos,
  onNavigateShorts,
  onNavigateChannels,
  onRequestAuth,
}: {
  lang: Lang;
  currentPage: AppNavPage;
  isAuthenticated: boolean;
  onNavigateBriefing: () => void;
  onNavigateHome: () => void;
  onNavigateFavorites: () => void;
  onNavigateCrypto: () => void;
  onNavigateSummaries: () => void;
  onNavigateVideos: () => void;
  onNavigateShorts: () => void;
  onNavigateChannels: () => void;
  onRequestAuth?: () => void;
}) {
  const navigateById: Record<GeneralMenuItemId, () => void> = {
    briefing: onNavigateBriefing,
    home: onNavigateHome,
    videos: onNavigateVideos,
    shorts: onNavigateShorts,
    channels: onNavigateChannels,
    cryptoChart: onNavigateCrypto,
    summaries: onNavigateSummaries,
    favorites: () => {
      if (isAuthenticated) onNavigateFavorites();
      else onRequestAuth?.();
    },
  };

  return (
    <div style={barWrap}>
      {GENERAL_MENU_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            trackEvent("nav.menu", { target_id: item.id, lang });
            navigateById[item.id]();
          }}
          style={currentPage === item.id ? activeStyle : base}
        >
          {t(item.labelKey, lang)}
        </button>
      ))}
    </div>
  );
}

/* ── SSR version (used in /summaries, SEO pages) ───────────────────── */

export function SeoGeneralMenu({
  lang,
  activePage,
}: {
  lang: Lang;
  /** `videoBriefings` kept as an alias of `summaries` so the (now-redirected) /briefings legacy callers don't fail typecheck — both surface the unified Archives pill since v2.7.0.
   *  `topArticles` is accepted for call-site compatibility but has no dedicated pill. */
  activePage?: GeneralMenuItemId | "topArticles" | "videoBriefings";
}) {
  const resolvedActive: GeneralMenuItemId | undefined =
    activePage === "videoBriefings" ? "summaries" : activePage === "topArticles" ? undefined : activePage;

  return (
    <div style={barWrap}>
      {GENERAL_MENU_ITEMS.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          style={resolvedActive === item.id ? activeStyle : base}
        >
          {t(item.labelKey, lang)}
        </Link>
      ))}
    </div>
  );
}
