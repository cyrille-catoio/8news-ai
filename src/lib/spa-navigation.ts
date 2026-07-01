"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppNavPage } from "@/app/components/AppHeader";
import { trackEvent } from "@/lib/track";

/**
 * SPA navigation state machine — single source of truth for the
 * URL ↔ `AppNavPage` mapping, History API plumbing, and navigation
 * analytics.
 *
 * v2.12 extracted from the inline declarations inside `Home` in
 * `src/app/app/page.tsx`. `PAGE_PATHS` was recreated on every render
 * there; moving it to module scope makes its identity stable across
 * renders (no behavior change, just less churn).
 *
 * Two scopes are intentionally NOT included in this hook:
 *   - Auth redirects (off admin pages for non-owners, off topics /
 *     favorites for anonymous) — they live in `Home` because they
 *     depend on `authLoading`, `authOwner`, `isAuthenticated`, and
 *     also drive `setAuthModalOpen`.
 *   - Scroll-to-top on `topArticles` — page-specific UX, also stays
 *     in `Home`.
 */

export const PAGE_PATHS: Record<AppNavPage, string> = {
  briefing: "/app",
  videos: "/app/videos",
  channels: "/app/channels",
  home: "/app/articles",
  stats: "/app/stats",
  crons: "/app/crons",
  topics: "/app/topics",
  settings: "/app/settings",
  changelog: "/app/changelog",
  feeds: "/app/feeds",
  categories: "/app/categories",
  favorites: "/app/favorites",
  dailySummaries: "/app/daily-summaries",
  youtubeChannels: "/app/youtube-channels",
  users: "/app/users",
  userActivity: "/app/user-activity",
  topArticles: "/app/top-articles",
  summaries: "/app/archives",
  cryptoChart: "/app/crypto-chart",
  // v2.5.17+ — placeholder route for the future SPA-internal landing
  // page; the public marketing landing lives at `/` and is rendered
  // by a separate Next route. Wired here so the AppNavPage discriminator
  // (used by AppHeader to hide the CryptoTicker on landing) is exhaustive.
  landing: "/app/landing",
};

/**
 * Reverse-lookup `AppNavPage` from a URL pathname.
 *
 * Special cases:
 *  - `"/"`, `"/app"`, `"/app/briefing"` all resolve to `"briefing"`
 *    (the SPA's home).
 *  - `"/app/summaries-browse"` (legacy v2.7.0 alias) → `"summaries"`.
 *  - Unknown paths fall back to `"briefing"`.
 */
export function pathToPage(path: string): AppNavPage {
  // Briefing is the SPA's home: hard refresh on /app, on /, or on
  // /app/briefing all land here.
  if (path === "/" || path === "/app" || path === "/app/briefing") return "briefing";
  // Legacy SPA path: /app/summaries-browse was renamed to /app/archives in
  // v2.7.0. Keep the old path bookmark-friendly by mapping it to the same
  // SPA page; the URL replaces itself with the canonical path on first
  // render via setCurrentPage's pushState below.
  if (path === "/app/summaries-browse") return "summaries";
  for (const [page, p] of Object.entries(PAGE_PATHS) as [AppNavPage, string][]) {
    if (p === path) return page;
  }
  return "briefing";
}

/**
 * Hook backing the SPA's navigation machine. Returns the current page +
 * a programmatic navigator that updates state, pushes/replaces the URL,
 * and emits a `page.view` analytics event.
 *
 * On mount: resolves the initial page from `window.location.pathname`,
 * `replaceState`s the URL so the canonical alias is used, fires the
 * initial `page.view`, and subscribes to `popstate` so browser back /
 * forward also flips React state and tracks the event.
 */
export function useSpaNavigation(): {
  currentPage: AppNavPage;
  setCurrentPage: (page: AppNavPage, replace?: boolean) => void;
} {
  const [currentPage, setCurrentPageRaw] = useState<AppNavPage>("briefing");

  const setCurrentPage = useCallback((page: AppNavPage, replace = false) => {
    setCurrentPageRaw(page);
    const path = PAGE_PATHS[page];
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      if (replace) {
        window.history.replaceState({ page }, "", path);
      } else {
        window.history.pushState({ page }, "", path);
      }
    }
    // Fires after every SPA navigation (button-click, popstate, initial
    // mount via the effect below). Lets the User Activity dashboard
    // compute "page views per page" and feed the conversion funnel's
    // first step.
    trackEvent("page.view", { target_id: page });
  }, []);

  useEffect(() => {
    const initial = pathToPage(window.location.pathname);
    setCurrentPageRaw(initial);
    window.history.replaceState(
      { page: initial },
      "",
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
    trackEvent("page.view", { target_id: initial });

    const handler = (e: PopStateEvent) => {
      const page = (e.state?.page as AppNavPage | undefined) ?? pathToPage(window.location.pathname);
      setCurrentPageRaw(page);
      trackEvent("page.view", { target_id: page, action: "popstate" });
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return { currentPage, setCurrentPage };
}
