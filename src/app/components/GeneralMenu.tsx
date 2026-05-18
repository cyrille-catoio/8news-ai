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

/* ── SPA version (used in page.tsx) ────────────────────────────────── */

export function GeneralMenu({
  lang,
  currentPage,
  isAuthenticated,
  analyzeTopLoading,
  onNavigateBriefing,
  onNavigateHome,
  onNavigateFavorites,
  onAnalyzeTop,
  onNavigateSummaries,
  onNavigateVideos,
  onNavigateMyTopics,
  onRequestAuth,
}: {
  lang: Lang;
  currentPage: AppNavPage;
  isAuthenticated: boolean;
  analyzeTopLoading: boolean;
  onNavigateBriefing: () => void;
  onNavigateHome: () => void;
  onNavigateFavorites: () => void;
  onAnalyzeTop: () => void;
  onNavigateSummaries: () => void;
  onNavigateVideos: () => void;
  onNavigateMyTopics: () => void;
  onRequestAuth?: () => void;
}) {
  return (
    <div style={barWrap}>
      <button
        type="button"
        onClick={() => {
          trackEvent("nav.menu", { target_id: "briefing", lang });
          onNavigateBriefing();
        }}
        style={currentPage === "briefing" ? activeStyle : base}
      >
        {t("briefingBtn", lang)}
      </button>
      <button
        type="button"
        onClick={() => {
          trackEvent("nav.menu", { target_id: "home", lang });
          onNavigateHome();
        }}
        style={currentPage === "home" ? activeStyle : base}
      >
        {t("generalMenuArticlesBtn", lang)}
      </button>
      <button
        type="button"
        onClick={() => {
          trackEvent("nav.menu", { target_id: "videos", lang });
          onNavigateVideos();
        }}
        style={currentPage === "videos" ? activeStyle : base}
      >
        {t("videosBtn", lang)}
      </button>
      <button
        type="button"
        onClick={() => {
          trackEvent("nav.menu", { target_id: "topArticles", lang });
          onAnalyzeTop();
        }}
        style={currentPage === "topArticles" ? activeStyle : base}
        disabled={analyzeTopLoading}
      >
        {t("analyzeTopArticlesBtn", lang)}
      </button>
      {/* « Archives » pill (v2.7.0+) — points at the unified /archives
          hub (SPA route /app/archives). Replaces the previous separate
          « Récaps vidéo » pill that pointed at /briefings — that route
          308-redirects here with `?type=videos` so the bookmark still
          works without burning a nav slot. */}
      <button
        type="button"
        onClick={() => {
          trackEvent("nav.menu", { target_id: "summaries", lang });
          onNavigateSummaries();
        }}
        style={currentPage === "summaries" ? activeStyle : base}
      >
        {t("dailySummaryBtn", lang)}
      </button>
      <button
        type="button"
        onClick={() => {
          trackEvent("nav.menu", { target_id: "favorites", lang });
          if (isAuthenticated) onNavigateFavorites();
          else onRequestAuth?.();
        }}
        style={currentPage === "favorites" ? activeStyle : base}
      >
        {t("myFavoritesBtn", lang)}
      </button>
      <button
        type="button"
        onClick={() => {
          trackEvent("nav.menu", { target_id: "myTopics", lang });
          onNavigateMyTopics();
        }}
        style={currentPage === "myTopics" ? activeStyle : base}
      >
        {t("myTopicsMenuBtn", lang)}
      </button>
    </div>
  );
}

/* ── SSR version (used in /summaries, SEO pages) ───────────────────── */

export function SeoGeneralMenu({
  lang,
  activePage,
}: {
  lang: Lang;
  /** `videoBriefings` kept as an alias of `summaries` so the (now-redirected) /briefings legacy callers don't fail typecheck — both surface the unified Archives pill since v2.7.0. */
  activePage?: "briefing" | "home" | "favorites" | "myTopics" | "topArticles" | "summaries" | "videos" | "videoBriefings";
}) {
  return (
    <div style={barWrap}>
      <Link href="/app" style={activePage === "briefing" ? activeStyle : base}>
        {t("briefingBtn", lang)}
      </Link>
      <Link href="/app/articles" style={activePage === "home" ? activeStyle : base}>
        {t("generalMenuArticlesBtn", lang)}
      </Link>
      <Link href="/app/videos" style={activePage === "videos" ? activeStyle : base}>
        {t("videosBtn", lang)}
      </Link>
      <Link href="/app/top-articles" style={activePage === "topArticles" ? activeStyle : base}>
        {t("analyzeTopArticlesBtn", lang)}
      </Link>
      {/* « Archives » SSR link (v2.7.0+) — points at the unified
          /archives hub. The previous /summaries route 308-redirects
          here, and /briefings → /archives?type=videos. */}
      <Link href="/archives" style={activePage === "summaries" ? activeStyle : base}>
        {t("dailySummaryBtn", lang)}
      </Link>
      <Link href="/app/favorites" style={activePage === "favorites" ? activeStyle : base}>
        {t("myFavoritesBtn", lang)}
      </Link>
      <Link href="/app/my-topics" style={activePage === "myTopics" ? activeStyle : base}>
        {t("myTopicsMenuBtn", lang)}
      </Link>
    </div>
  );
}
