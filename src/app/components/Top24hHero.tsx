"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { color, card, spinnerStyle } from "@/lib/theme";
import { t, type Lang, dateLocale } from "@/lib/i18n";
import { formatScore } from "@/lib/score-format";
import { scoreTierColor } from "@/app/components/briefing/utils";
import { Top24hAudio } from "@/app/components/Top24hAudio";
import { trackEvent } from "@/lib/track";
import { Chevron, DoubleChevron, FullscreenIcon, RefIcon, YouTubeIcon } from "@/app/components/top24h/Top24hHeroIcons";
import { PodcastReader } from "@/app/components/top24h/PodcastReader";
import {
  groupBullets,
  countGroups,
  formatSummaryDayLabel,
  type Bullet,
} from "@/app/components/top24h/Top24hHeroHelpers";
import { kicker as kickerStyle } from "@/app/components/briefing/styles";
import { HistoryArrows } from "@/app/components/briefing/HistoryArrows";
import {
  readCachedSnapshot,
  writeCachedSnapshot,
  clearCachedSnapshots,
} from "@/app/components/top24h/top24h-cache";
import { todayUtc } from "@/lib/dates-utc";

/**
 * Hero card pinned at the very top of `/app` (BriefingPage). Renders
 * the day's pre-computed Top articles AI summary as a collapsible
 * accordion: visitors see only the per-group headlines as bullet
 * points, click one to expand the bullets that belong to that
 * thematic group.
 *
 * Data source: the same `GET /api/news/top-summary/latest?lang=…`
 * already used by `/top-articles`. The cron writes once a day; this
 * card reads the latest available row regardless of whether today's
 * tick has run yet (transparent fallback to yesterday).
 *
 * Hidden states:
 *  - `loading`: a single discreet spinner while the first fetch is
 *    in flight. Failure to fetch (network / DB outage) silently hides
 *    the card so the rest of the home keeps rendering.
 *  - `404` (no row in `top_summaries` yet, fresh deploy before the
 *    first cron tick): hide the card too. The dedicated `/top-articles`
 *    page exposes its own empty-state copy; the home shouldn't carry
 *    that message.
 */


interface Snapshot {
  bullets: Bullet[];
  summaryDate: string;
  generatedAt: string;
  hasOlder?: boolean;
  offset?: number;
}










export function Top24hHero({
  lang,
  data: externalData,
  defaultOpen = false,
  title,
  appendSummaryDateToTitle = false,
  onOpenChat,
  showHistoryControls = false,
  showHomeRefresh = false,
  kickerLabel,
  hideTitlePrefix = false,
  showReaderButton = false,
}: {
  lang: Lang;
  /** When provided, renders an « Ask the AI » button in the heading row
   *  that opens the Daily Podcast chat grounded in today's briefing.
   *  Home use case only. */
  onOpenChat?: () => void;
  /** When provided (even as `null`), the component skips its self-fetch
   *  and uses the parent's snapshot directly. Lets the /top-articles
   *  page pass its own already-fetched snapshot so we don't duplicate
   *  the network call (the parent also needs the snapshot for its
   *  article list). When omitted, the component fetches on its own
   *  (the home use case). */
  data?: Snapshot | null;
  /** Default `false` (collapsed). On the home we want the visitor to
   *  scan headlines and only expand what interests them; on the
   *  dedicated /top-articles page, the visitor explicitly came for the
   *  briefing — opening every group up front matches the prior
   *  SummaryBox layout that page replaced. */
  defaultOpen?: boolean;
  /**
   * Override the H2 title rendered next to the « Generated on … »
   * stamp. Defaults to `t("top24hHeroTitle")` so legacy callers that
   * don't pass this prop keep their previous label. v2.6.12+ the
   * dedicated wrappers `<HomeTop24hHero>` / `<TopArticlesTop24hHero>`
   * pass their own title so the home (« Podcast du jour ») and the
   * dedicated page (« Top articles 24h ») can diverge without
   * touching the base component again.
   */
  title?: string;
  /** When true, appends ` — {summaryDate}` to the H2 using the
   *  snapshot's `summaryDate` (not wall-clock « today »). v2.6.13+
   *  home wrapper only — keeps `/top-articles` and archive pages
   *  unchanged. */
  appendSummaryDateToTitle?: boolean;
  /** Home-only: show discreet chevrons next to the Top articles 24h
   *  kicker to browse previous daily podcast snapshots. */
  showHistoryControls?: boolean;
  /** Home-only: full-page reload pill to the right of the history
   *  chevrons (podcast du jour header). */
  showHomeRefresh?: boolean;
  /** Optional kicker above the card. Defaults to « Top articles · 24h ». */
  kickerLabel?: string;
  /** When true with `appendSummaryDateToTitle`, render only the date in
   *  the card heading instead of `{title} — {date}`. Home uses this so
   *  « Podcast du jour » appears only once, as the section kicker. */
  hideTitlePrefix?: boolean;
  /** Home-only (v2.19+): renders a fullscreen-reader button in the
   *  heading row (next to the expand/collapse toggle) that opens the
   *  immersive `PodcastReader` — one news per screen, large type,
   *  TikTok-style vertical swipe on phones. Follows the snapshot on
   *  screen, so history navigation opens the reader on that older
   *  podcast too. */
  showReaderButton?: boolean;
}) {
  const isSelfFetched = externalData === undefined;
  // Stale-while-revalidate: hydrate from the persisted cache synchronously
  // so the hero paints instantly on a returning visit instead of showing
  // the spinner for the full RTT of the /api/news/top-summary/latest call.
  // The live fetch below still runs and silently replaces the snapshot
  // when it returns, so we never serve a stale value for more than one
  // network round-trip.
  const cachedInitial = isSelfFetched ? readCachedSnapshot<Snapshot>(lang, 0) : null;
  const [snapInternal, setSnapInternal] = useState<Snapshot | null>(cachedInitial);
  const [loadingInternal, setLoadingInternal] = useState(isSelfFetched && !cachedInitial);
  const [errorInternal, setErrorInternal] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasOlder, setHistoryHasOlder] = useState(Boolean(cachedInitial?.hasOlder));
  /** Bumped by the hourly stale-date watcher below to force the fetch
   *  effect to re-run for the same `(lang, historyOffset=0)` tuple when
   *  the visible snapshot's `summaryDate` no longer matches today UTC
   *  (the cron writes a fresh row every morning — if the user keeps the
   *  tab open across midnight UTC, the podcast on screen falls behind).
   *  Live offset only; freezing on a history offset is intentional. */
  const [refetchTick, setRefetchTick] = useState(0);
  /** Mirrors `historyHasOlder` after each successful fetch — avoids a stale
   *  closure inside `setHistoryOffset` (the old `historyHasOlder ? o + 1`
   *  pattern could read `false` from the initial render and never
   *  increment even when the latest API said `hasOlder: true`). */
  const historyHasOlderRef = useRef(false);
  /** Avoid re-fetch loops when the API legitimately still serves yesterday. */
  const staleRefetchKeyRef = useRef<string | null>(null);
  const snap = isSelfFetched ? snapInternal : externalData ?? null;

  // Reset the open-index set whenever the snapshot or `defaultOpen`
  // changes. When `defaultOpen=true` we open every group up front
  // (the /top-articles page wants the whole briefing visible); when
  // false we open none (the home accordion wants headlines only).
  // Manual toggle clicks update `openIdx` directly and aren't
  // overwritten because neither dep below changes on click.
  const groupCount = snap ? countGroups(snap.bullets) : 0;
  const [openIdx, setOpenIdx] = useState<Set<number>>(new Set());
  /** Fullscreen immersive reader (v2.19+, `showReaderButton` consumers
   *  only). Closed on every snapshot change so history navigation
   *  never leaves a stale day's reader on screen. */
  const [readerOpen, setReaderOpen] = useState(false);
  useEffect(() => {
    setReaderOpen(false);
  }, [snap?.summaryDate]);
  useEffect(() => {
    setOpenIdx(
      defaultOpen
        ? new Set(Array.from({ length: groupCount }, (_, i) => i))
        : new Set(),
    );
  }, [defaultOpen, groupCount]);

  // Reset history when the UI language flips. `useLayoutEffect` runs before
  // the fetch `useEffect`, so the first network tick after a lang change
  // always uses `offset=0` instead of briefly re-fetching the previous
  // offset with the new lang (which could 404 or show the wrong day).
  useLayoutEffect(() => {
    historyHasOlderRef.current = false;
    setHistoryOffset(0);
  }, [lang]);

  useEffect(() => {
    if (!isSelfFetched) return;
    let cancelled = false;
    const offsetRequested = historyOffset;
    // SWR: hydrate from the local cache for THIS (lang, offset) tuple
    // before we hit the network. The very first effect run was already
    // pre-seeded by the lazy initialiser above, but subsequent runs
    // (lang flip, history-arrow navigation) need to repeat the cache
    // hit so the new tuple paints instantly too.
    const cached = readCachedSnapshot<Snapshot>(lang, historyOffset);
    if (cached) {
      historyHasOlderRef.current = Boolean(cached.hasOlder);
      setSnapInternal(cached);
      setHistoryHasOlder(Boolean(cached.hasOlder));
      setLoadingInternal(false);
    } else {
      setLoadingInternal(true);
    }
    setErrorInternal(false);
    fetch(`/api/news/top-summary/latest?lang=${lang}&offset=${historyOffset}`, { cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return null;
        if (r.status === 404) {
          if (offsetRequested > 0) {
            setHistoryOffset((o) => Math.max(0, o - 1));
            setErrorInternal(false);
          } else if (!cached) {
            // Only flip into the error state when we don't already have a
            // cached snapshot on screen — otherwise we'd swap a visible,
            // recent briefing for an empty surface on a transient 404.
            setErrorInternal(true);
          }
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as Snapshot;
      })
      .then((json) => {
        if (cancelled || !json) return;
        const older = Boolean(json.hasOlder);
        historyHasOlderRef.current = older;
        setSnapInternal(json);
        setHistoryHasOlder(older);
        writeCachedSnapshot<Snapshot>(lang, offsetRequested, json);
      })
      .catch(() => {
        if (cancelled || cached) return;
        setErrorInternal(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingInternal(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSelfFetched, lang, historyOffset, refetchTick]);

  // Stale-date watcher (live offset only).
  //
  // The Top articles 24h cron writes a new `top_summaries` row each
  // morning keyed on `summary_date = todayUtc()`. A visitor who keeps
  // the home open across UTC midnight would otherwise still see
  // yesterday's podcast until a full reload. We compare the visible
  // `summaryDate` to today UTC on mount, every hour, and when the tab
  // becomes visible again — then bump `refetchTick` once per stale
  // (date, today) pair so we don't hammer the API when today's row
  // simply doesn't exist yet.
  useEffect(() => {
    if (!isSelfFetched) return;
    if (historyOffset !== 0) return;
    if (typeof document === "undefined") return;

    const check = () => {
      if (document.visibilityState === "hidden") return;
      const current = snap?.summaryDate;
      const today = todayUtc();
      if (!current || current === today) {
        staleRefetchKeyRef.current = null;
        return;
      }
      const key = `${current}->${today}`;
      if (staleRefetchKeyRef.current === key) return;
      staleRefetchKeyRef.current = key;
      setRefetchTick((n) => n + 1);
    };

    check();
    const intervalId = setInterval(check, 60 * 60 * 1000);
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") check();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isSelfFetched, historyOffset, snap?.summaryDate]);

  // Loading: discreet spinner that doesn't push the rest of the home
  // off-screen. ~80px tall is enough to feel like a placeholder while
  // remaining unobtrusive when the cron has nothing to show yet. Only
  // shown when self-fetching — when the parent drives `data`, it
  // owns its own loading skeleton.
  if (isSelfFetched && loadingInternal) {
    return (
      <section style={{ marginBottom: 36 }}>
        <div style={kickerStyle(color.gold)}>{kickerLabel ?? t("top24hHeroKicker", lang)}</div>
        <div
          style={{
            ...card,
            padding: "26px 22px",
            background: color.surface,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <span style={spinnerStyle(22)} />
        </div>
      </section>
    );
  }

  // Hide on error / 404 / no data — the home shouldn't display an
  // empty-state copy in the visitor's #1 above-the-fold slot, and on
  // /top-articles the parent renders its own empty state anyway.
  if (isSelfFetched && errorInternal) return null;
  if (!snap) return null;

  const groups = groupBullets(snap.bullets);
  if (groups.length === 0) return null;

  const toggle = (i: number) => {
    setOpenIdx((prev) => {
      const next = new Set(prev);
      const willOpen = !next.has(i);
      if (willOpen) next.add(i);
      else next.delete(i);
      // Fire telemetry outside the setState so the type/title is stable.
      const groupTitle = groups[i]?.title || `index_${i}`;
      trackEvent(willOpen ? "top24h.group_expand" : "top24h.group_collapse", {
        target_id: groupTitle,
        lang,
        meta: { summaryDate: snap?.summaryDate ?? null, groupIndex: i },
      });
      return next;
    });
  };

  const locale = dateLocale(lang);
  const baseTitle = title ?? t("top24hHeroTitle", lang);
  const summaryDateLabel = formatSummaryDayLabel(snap.summaryDate, lang);
  const headingTitle = appendSummaryDateToTitle
    ? hideTitlePrefix
      ? summaryDateLabel
      : `${baseTitle} — ${summaryDateLabel}`
    : baseTitle;

  return (
    <section style={{ marginBottom: 36 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div style={kickerStyle(color.gold)}>{kickerLabel ?? t("top24hHeroKicker", lang)}</div>
        {showHistoryControls && isSelfFetched && (
          <HistoryArrows
            offset={historyOffset}
            canGoOlder={historyHasOlder}
            onPrev={() => {
              if (!historyHasOlderRef.current) return;
              trackEvent("top24h.history_older", {
                lang,
                meta: { fromOffset: historyOffset, fromDate: snap?.summaryDate ?? null },
              });
              setHistoryOffset((o) => o + 1);
            }}
            onNext={() => {
              if (historyOffset === 0) return;
              trackEvent("top24h.history_newer", {
                lang,
                meta: { fromOffset: historyOffset, fromDate: snap?.summaryDate ?? null },
              });
              setHistoryOffset((o) => Math.max(0, o - 1));
            }}
            lang={lang}
            newerLabel={lang === "fr" ? "Podcast plus récent" : "Newer podcast"}
            olderLabel={lang === "fr" ? "Podcast précédent" : "Previous podcast"}
          />
        )}
        {showHomeRefresh && (
          <button
            type="button"
            onClick={() => {
              trackEvent("nav.refresh_home", { lang });
              clearCachedSnapshots();
              if (typeof window !== "undefined") window.location.reload();
            }}
            aria-label={lang === "fr" ? "Rafraîchir la page" : "Refresh page"}
            title={lang === "fr" ? "Rafraîchir la page" : "Refresh page"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginLeft: "auto",
              background: "rgba(255,255,255,0.02)",
              border: `1px solid ${color.border}`,
              borderRadius: 999,
              color: color.textMuted,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
              padding: "5px 12px 5px 10px",
              fontFamily: "inherit",
              transition:
                "color 140ms ease, border-color 140ms ease, background 140ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = color.gold;
              e.currentTarget.style.borderColor = color.gold;
              e.currentTarget.style.background = "rgba(201,162,39,0.10)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = color.textMuted;
              e.currentTarget.style.borderColor = color.border;
              e.currentTarget.style.background = "rgba(255,255,255,0.02)";
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>{lang === "fr" ? "Rafraîchir" : "Refresh"}</span>
          </button>
        )}
      </div>
      {appendSummaryDateToTitle &&
        historyOffset === 0 &&
        snap.summaryDate !== todayUtc() && (
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 13,
              color: color.textMuted,
              lineHeight: 1.45,
              maxWidth: 560,
            }}
          >
            {t("top24hHeroPendingToday", lang)}
          </p>
        )}
      <div
        style={{
          ...card,
          padding: "22px 22px 16px",
          background: color.surface,
        }}
      >
        <div className="top24h-hero-header" style={{ marginBottom: 14 }}>
          <div className="top24h-hero-heading-row">
          <h2
            className="top24h-hero-title"
            style={{
              fontFamily: "ui-serif, Georgia, serif",
              fontSize: "clamp(20px, 2.6vw, 26px)",
              lineHeight: 1.2,
              color: color.text,
              margin: 0,
              fontWeight: 400,
              letterSpacing: "-0.01em",
            }}
          >
            {headingTitle}
          </h2>
            {/* « Généré à … » timestamp inlined into the heading row
                (v2.12.1+) — sits to the left of the expand/collapse
                toggle so the card opens with a tighter header. v2.18.2+
                time-only (no date, no seconds) since the date is already
                the H2 title; hidden entirely on phones via CSS. */}
            <div
              className="top24h-hero-generated"
              style={{ color: color.textDim, fontSize: 12, letterSpacing: "0.02em" }}
            >
              {t("topSummaryGeneratedAt", lang).replace(
                "{time}",
                new Date(snap.generatedAt).toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              )}
            </div>
            {/* Fullscreen reader button (v2.19+, home only via
                `showReaderButton`). Sits immediately left of the master
                toggle with the same chrome so the header buttons read
                as one interaction family. Opens the immersive
                one-news-per-screen `PodcastReader` on the snapshot
                currently displayed. */}
            {/* « Ask the AI » — moved from the card footer into the
                heading row (next to « Plein écran ») so the two podcast
                actions sit together at the top. Same gold pill. */}
            {onOpenChat && (
              <button
                type="button"
                className="top24h-hero-reader-btn"
                onClick={onOpenChat}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  border: `1px solid ${color.gold}`,
                  background: "rgba(201,162,39,0.10)",
                  color: color.gold,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 700,
                  padding: "6px 14px",
                  borderRadius: 999,
                  letterSpacing: "0.01em",
                  whiteSpace: "nowrap",
                }}
              >
                {t("homeAskAiButton", lang)}
              </button>
            )}
            {showReaderButton && (
              <button
                type="button"
                className="top24h-hero-reader-btn"
                onClick={() => {
                  trackEvent("top24h.reader_open", {
                    lang,
                    meta: { summaryDate: snap.summaryDate, groupCount: groups.length },
                  });
                  setReaderOpen(true);
                }}
                aria-label={t("top24hReaderOpen", lang)}
                title={t("top24hReaderOpen", lang)}
                // Same gold pill register as the « Ask the AI » button
                // beside it — the two podcast affordances read as one
                // family.
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  border: `1px solid ${color.gold}`,
                  background: "rgba(201,162,39,0.10)",
                  color: color.gold,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 700,
                  padding: "6px 14px",
                  borderRadius: 999,
                  letterSpacing: "0.01em",
                  whiteSpace: "nowrap",
                }}
              >
                <FullscreenIcon />
                <span>{t("top24hReaderButtonLabel", lang)}</span>
              </button>
            )}
            {/* Master toggle. `allOpen` reflects « every group is
                expanded »; clicking flips the whole set in one
                update. Title attribute doubles as a tooltip for the
                desktop hover affordance. The button sits at the
                visual top-right of the card per the v2.6.13+ spec —
                same gold hover treatment as the per-row chevrons so
                the affordance reads as a single interaction family. */}
            {(() => {
              const allOpen = groups.length > 0 && groups.every((_, i) => openIdx.has(i));
              const label = allOpen
                ? t("top24hHeroCollapseAll", lang)
                : t("top24hHeroExpandAll", lang);
              return (
                <button
                  type="button"
                  className="top24h-hero-toggle"
                  onClick={() => {
                    trackEvent(allOpen ? "top24h.collapse_all" : "top24h.expand_all", {
                      lang,
                      meta: { summaryDate: snap.summaryDate, groupCount: groups.length },
                    });
                    if (allOpen) setOpenIdx(new Set());
                    else
                      setOpenIdx(
                        new Set(
                          Array.from({ length: groups.length }, (_, i) => i),
                        ),
                      );
                  }}
                  aria-label={label}
                  aria-expanded={allOpen}
                  title={label}
                  // Icon-only button. `aria-label` + `title` still
                  // expose the label to assistive tech and as a hover
                  // tooltip; the visible text was redundant once the
                  // double-chevron glyph carried enough meaning on its
                  // own. Padding stays symmetrical so the button reads
                  // as a square hit-target (≈ 30×30 px) instead of a
                  // wide pill.
                  style={{
                    background: "transparent",
                    border: `1px solid ${color.border}`,
                    color: color.textMuted,
                    cursor: "pointer",
                    padding: "5px 8px",
                    borderRadius: 6,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "color 140ms ease, border-color 140ms ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = color.gold;
                    e.currentTarget.style.borderColor = color.gold;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = color.textMuted;
                    e.currentTarget.style.borderColor = color.border;
                  }}
                >
                  <DoubleChevron open={allOpen} />
                </button>
              );
            })()}
          </div>
        </div>

        <Top24hAudio
          bullets={snap.bullets}
          lang={lang}
          date={snap.summaryDate}
        />

        {/* No borderTop here: the AudioPlayer's full-width progress bar
            right above already draws a horizontal line — a top border
            would read as a weird double rule. */}
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
          {groups.map((g, i) => {
            const collapsible = g.title.length > 0;
            const open = openIdx.has(i);
            return (
              <li
                key={i}
                style={{
                  borderBottom: `1px solid ${color.border}`,
                }}
              >
                {collapsible ? (
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    aria-expanded={open}
                    className="top24h-row"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "12px 4px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      color: open ? color.gold : color.text,
                      // Group headlines are the section's real titles (gold
                      // when expanded — always the case on the home where
                      // the accordion opens by default): heading-scale type,
                      // responsive between phone and desktop.
                      fontSize: "clamp(17px, 2.2vw, 20px)",
                      fontWeight: 700,
                      letterSpacing: "-0.01em",
                      lineHeight: 1.3,
                      transition: "color 160ms ease",
                    }}
                  >
                    {/* Chevron moved to the LEFT (replaces the • dot) so the
                        score becomes the right-most element, matching the
                        Top 5 / Your topics / video list rows (v2.19). */}
                    <span style={{ color: open ? color.gold : color.textMuted, flexShrink: 0, display: "inline-flex" }}>
                      <Chevron open={open} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>{g.title}</span>
                    {/* Editorial importance score 1-10 (mig. 026+).
                        Read off the first bullet of the group — every
                        bullet of a same-title run carries the same
                        value (propagated by `analyzeWithAI` flatten).
                        Hidden when the legacy column is missing or the
                        LLM omitted the score. Plain tier-colored « 9/10 »
                        text; the first row spells out « Score : » so the
                        number is self-explanatory (v2.20.6). */}
                    {(() => {
                      const score = g.bullets[0]?.importanceScore;
                      if (typeof score !== "number") return null;
                      return (
                        <span
                          style={{
                            flexShrink: 0,
                            fontFamily: "ui-monospace, Menlo, monospace",
                            fontSize: 16,
                            fontWeight: 700,
                            letterSpacing: "0.02em",
                            color: scoreTierColor(score),
                          }}
                          aria-label={`Importance ${score}/10`}
                        >
                          {i === 0 && (lang === "fr" ? "Score : " : "Score: ")}
                          {formatScore(score)}/10
                        </span>
                      );
                    })()}
                  </button>
                ) : (
                  // Untitled fallback row — display the bullet text
                  // directly (no chevron, no toggle). Keeps the layout
                  // intact for legacy snapshots written before the
                  // grouped prompt landed.
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "12px 4px",
                      color: color.textSecondary,
                      fontSize: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ color: color.gold, flexShrink: 0, fontSize: 18, lineHeight: 1 }}>•</span>
                    <span>{g.bullets[0]?.text ?? ""}</span>
                  </div>
                )}

                {collapsible && open && (
                  <div
                    className="top24h-bullets-wrap"
                    style={{
                      padding: "4px 4px 16px 26px",
                      animation: "top24hExpandFade 220ms ease-out both",
                    }}
                  >
                    {g.bullets.map((b, j) => (
                      <div
                        key={j}
                        className="top24h-bullet-body"
                        style={{
                          color: color.textSecondary,
                          fontSize: 16,
                          lineHeight: 1.6,
                          marginBottom: j < g.bullets.length - 1 ? 12 : 0,
                        }}
                      >
                        <div style={{ display: "flex", gap: 8 }}>
                          <span style={{ color: color.gold, flexShrink: 0, opacity: 0.6 }}>›</span>
                          <span>{b.text}</span>
                        </div>
                        {b.refs.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              marginTop: 8,
                              marginLeft: 18,
                              flexWrap: "wrap",
                            }}
                          >
                            {b.refs.map((ref, k) => (
                              <a
                                key={k}
                                href={ref.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={ref.title}
                                onClick={() =>
                                  trackEvent("top24h.ref_click", {
                                    target_id: ref.link,
                                    lang,
                                    meta: {
                                      source: ref.source,
                                      title: ref.title,
                                      summaryDate: snap.summaryDate,
                                    },
                                  })
                                }
                                // Chip/pill style: a thin gold border + soft
                                // gold tint background makes the source links
                                // pop instead of blending into the body text.
                                // Hover deepens the tint to confirm clickability
                                // and adds a subtle lift via box-shadow.
                                style={{
                                  color: color.gold,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  textDecoration: "none",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  padding: "3px 9px",
                                  borderRadius: 999,
                                  border: "1px solid rgba(201, 162, 39, 0.45)",
                                  background: "rgba(201, 162, 39, 0.10)",
                                  letterSpacing: "0.01em",
                                  lineHeight: 1.3,
                                  transition: "background 140ms ease, border-color 140ms ease, transform 140ms ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = "rgba(201, 162, 39, 0.22)";
                                  e.currentTarget.style.borderColor = "rgba(201, 162, 39, 0.85)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = "rgba(201, 162, 39, 0.10)";
                                  e.currentTarget.style.borderColor = "rgba(201, 162, 39, 0.45)";
                                }}
                              >
                                {ref.source} {b.isVideo ? <YouTubeIcon /> : <RefIcon />}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Immersive fullscreen reader (v2.19+). Mounted on demand so its
          audio player never competes with the card's own while closed. */}
      {readerOpen && (
        <PodcastReader
          bullets={snap.bullets}
          lang={lang}
          summaryDate={snap.summaryDate}
          onClose={() => {
            trackEvent("top24h.reader_close", {
              lang,
              meta: { summaryDate: snap.summaryDate },
            });
            setReaderOpen(false);
          }}
        />
      )}
    </section>
  );
}
