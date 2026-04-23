"use client";

import type { CSSProperties } from "react";
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
      {/* Hard <a> link: /briefings is an SSR route outside the SPA, so
          we want a full navigation (not pushState). The current SPA can't
          render this page in-place. */}
      <a href="/briefings" style={base}>
        {t("videoBriefingsBtn", lang)}
      </a>
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
  activePage?: "briefing" | "home" | "favorites" | "topArticles" | "summaries" | "videos" | "videoBriefings";
}) {
  const { session } = useAuth();
  const authed = Boolean(session?.user);

  return (
    <div style={barWrap}>
      <a href="/app" style={activePage === "briefing" ? activeStyle : base}>
        {t("briefingBtn", lang)}
      </a>
      <a href="/app/videos" style={activePage === "videos" ? activeStyle : base}>
        {t("videosBtn", lang)}
      </a>
      <a href="/briefings" style={activePage === "videoBriefings" ? activeStyle : base}>
        {t("videoBriefingsBtn", lang)}
      </a>
      <a href="/app/articles" style={activePage === "home" ? activeStyle : base}>
        {t("generalMenuArticlesBtn", lang)}
      </a>
      <a href="/app/top-articles" style={activePage === "topArticles" ? activeStyle : base}>
        {t("analyzeTopArticlesBtn", lang)}
      </a>
      <a href="/summaries" style={activePage === "summaries" ? activeStyle : base}>
        {t("dailySummaryBtn", lang)}
      </a>
      {authed && (
        <a href="/app/favorites" style={activePage === "favorites" ? activeStyle : base}>
          {t("myFavoritesBtn", lang)}
        </a>
      )}
    </div>
  );
}
