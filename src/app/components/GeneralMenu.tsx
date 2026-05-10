"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { color } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import type { AppNavPage } from "@/app/components/AppHeader";
import { useAuth } from "@/app/providers";

/* ── Shared styles ─────────────────────────────────────────────────── */

const barWrap: CSSProperties = {
  marginBottom: 30,
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const base: CSSProperties = {
  border: `1px solid ${color.borderLight}`,
  background: "rgba(255,255,255,0.05)",
  color: color.textSecondary,
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
  border: `1px solid ${color.gold}`,
  background: "rgba(201,162,39,0.15)",
  color: color.gold,
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
  onRequestAuth?: () => void;
}) {
  return (
    <div style={barWrap}>
      <button
        type="button"
        onClick={onNavigateBriefing}
        style={currentPage === "briefing" ? activeStyle : base}
      >
        {t("briefingBtn", lang)}
      </button>
      <button
        type="button"
        onClick={onNavigateVideos}
        style={currentPage === "videos" ? activeStyle : base}
      >
        {t("videosBtn", lang)}
      </button>
      <button
        type="button"
        onClick={onNavigateHome}
        style={currentPage === "home" ? activeStyle : base}
      >
        {t("generalMenuArticlesBtn", lang)}
      </button>
      <button
        type="button"
        onClick={onAnalyzeTop}
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
        onClick={onNavigateSummaries}
        style={currentPage === "summaries" ? activeStyle : base}
      >
        {t("dailySummaryBtn", lang)}
      </button>
      {isAuthenticated && (
        <button
          type="button"
          onClick={onNavigateFavorites}
          style={currentPage === "favorites" ? activeStyle : base}
        >
          {t("myFavoritesBtn", lang)}
        </button>
      )}
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
  activePage?: "briefing" | "home" | "favorites" | "topArticles" | "summaries" | "videos" | "videoBriefings";
}) {
  const { session } = useAuth();
  const authed = Boolean(session?.user);

  return (
    <div style={barWrap}>
      <Link href="/app" style={activePage === "briefing" ? activeStyle : base}>
        {t("briefingBtn", lang)}
      </Link>
      <Link href="/app/videos" style={activePage === "videos" ? activeStyle : base}>
        {t("videosBtn", lang)}
      </Link>
      <Link href="/app/articles" style={activePage === "home" ? activeStyle : base}>
        {t("generalMenuArticlesBtn", lang)}
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
      {authed && (
        <Link href="/app/favorites" style={activePage === "favorites" ? activeStyle : base}>
          {t("myFavoritesBtn", lang)}
        </Link>
      )}
    </div>
  );
}
