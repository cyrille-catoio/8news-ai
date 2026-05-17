"use client";

import { useCallback, useEffect, useState } from "react";
import { t, type Lang } from "@/lib/i18n";
import type { AppNavPage } from "@/app/components/AppHeader";
import { Top24hHero } from "@/app/components/Top24hHero";
import { useAuth } from "@/app/providers";
import { getCookie, setCookie } from "@/lib/cookies";

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
 *
 * v2.8.2+ also owns the per-snapshot-date « Lu / Read » state:
 *   - **Authenticated users**: backed by the `user_activity` DB table
 *     (one row per (user, snapshot date)) via `/api/user/activity`.
 *     The state survives across devices and persists indefinitely —
 *     fixing the prior cookie behavior that only tracked « today ».
 *   - **Anonymous visitors**: backed by a comma-separated list of
 *     marked snapshot dates stored in the `top24hReadDates` cookie,
 *     capped to the last 60 entries so the cookie stays under the 4 KB
 *     per-cookie limit.
 *   - In both modes, the checkbox + collapse follow the snapshot
 *     currently on screen, including when the history arrows navigate
 *     to an older podcast.
 */

const ACTIVITY_TYPE = "podcast_read";
const ANON_COOKIE = "top24hReadDates";
const ANON_COOKIE_CAP = 60;

interface SnapshotInfo {
  summaryDate: string;
}

/** Parses the comma-separated list of dates stored in the anonymous
 *  cookie, dropping anything that doesn't look like a YYYY-MM-DD. */
function readAnonCookieSet(): Set<string> {
  if (typeof document === "undefined") return new Set();
  const raw = getCookie(ANON_COOKIE);
  if (!raw) return new Set();
  const out = new Set<string>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) out.add(trimmed);
  }
  return out;
}

function writeAnonCookieSet(set: Set<string>): void {
  if (set.size === 0) {
    setCookie(ANON_COOKIE, "", 0);
    return;
  }
  // Keep the cookie payload bounded — newest first, oldest dropped.
  const ordered = Array.from(set).sort().reverse().slice(0, ANON_COOKIE_CAP);
  setCookie(ANON_COOKIE, ordered.join(","), 365);
}

export function HomeTop24hHero({
  lang,
  onNavigate,
}: {
  lang: Lang;
  onNavigate: (page: AppNavPage) => void;
}) {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const isAuthenticated = Boolean(userId);

  // Set of snapshot dates the current user has marked as read. For
  // authenticated users this mirrors the DB rows for the user;
  // anonymous visitors get a cookie-backed cache.
  const [readDates, setReadDates] = useState<Set<string>>(new Set());
  const [currentSnapshot, setCurrentSnapshot] = useState<SnapshotInfo | null>(
    null,
  );

  // Hydrate the read set on mount and whenever the auth status
  // changes (sign-in → migrate from cookie + fetch DB; sign-out →
  // fall back to cookie). The DB fetch is gated on `!authLoading`
  // because `userId` is null while the session is still resolving.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    if (!isAuthenticated) {
      setReadDates(readAnonCookieSet());
      return;
    }

    fetch(`/api/user/activity?type=${ACTIVITY_TYPE}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        const entries = (json.entries ?? []) as Array<{
          target_id: string;
          value: number;
        }>;
        const next = new Set<string>();
        for (const e of entries) {
          if (e.value === 1 && /^\d{4}-\d{2}-\d{2}$/.test(e.target_id)) {
            next.add(e.target_id);
          }
        }
        setReadDates(next);
      })
      .catch(() => {
        /* network/error → leave the set empty; user can still toggle */
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated]);

  const handleSnapshotChange = useCallback((snap: { summaryDate: string }) => {
    setCurrentSnapshot({ summaryDate: snap.summaryDate });
  }, []);

  const currentDate = currentSnapshot?.summaryDate ?? null;
  const isRead = currentDate ? readDates.has(currentDate) : false;

  const onToggleRead = useCallback(() => {
    if (!currentDate) return;
    const next = !isRead;
    // Optimistic local update first so the collapse animation fires
    // immediately — the network write is best-effort and reverts the
    // set on failure so the UI doesn't lie about the persisted state.
    setReadDates((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(currentDate);
      else copy.delete(currentDate);
      if (!isAuthenticated) writeAnonCookieSet(copy);
      return copy;
    });

    if (!isAuthenticated) return;

    fetch("/api/user/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activity_type: ACTIVITY_TYPE,
        target_id: currentDate,
        action: next ? "mark_read" : "unmark_read",
        value: next ? 1 : 0,
      }),
    })
      .then((r) => {
        if (r.ok) return;
        // Revert on server failure so the on-screen state matches reality.
        setReadDates((prev) => {
          const copy = new Set(prev);
          if (next) copy.delete(currentDate);
          else copy.add(currentDate);
          return copy;
        });
      })
      .catch(() => {
        setReadDates((prev) => {
          const copy = new Set(prev);
          if (next) copy.delete(currentDate);
          else copy.add(currentDate);
          return copy;
        });
      });
  }, [currentDate, isRead, isAuthenticated]);

  return (
    <Top24hHero
      lang={lang}
      onNavigate={onNavigate}
      title={t("top24hHeroHomeTitle", lang)}
      appendSummaryDateToTitle
      isRead={isRead}
      onToggleRead={onToggleRead}
      showHistoryControls
      onSnapshotChange={handleSnapshotChange}
    />
  );
}
