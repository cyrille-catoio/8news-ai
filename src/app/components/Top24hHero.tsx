"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { color, card, spinnerStyle } from "@/lib/theme";
import { t, type Lang, dateLocale } from "@/lib/i18n";
import type { AppNavPage } from "@/app/components/AppHeader";
import { ScoreMeter } from "@/app/components/ScoreMeter";
import { Top24hAudio } from "@/app/components/Top24hAudio";
import { trackEvent } from "@/lib/track";
import { Chevron, DoubleChevron, RefIcon } from "@/app/components/top24h/Top24hHeroIcons";
import {
  groupBullets,
  countGroups,
  kickerStyle,
  formatSummaryDayLabel,
  type Bullet,
} from "@/app/components/top24h/Top24hHeroHelpers";
import { Top24hHistoryArrows } from "@/app/components/top24h/Top24hHistoryArrows";

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
  onNavigate,
  data: externalData,
  showSeeAllLink = true,
  defaultOpen = false,
  title,
  appendSummaryDateToTitle = false,
  isRead,
  onToggleRead,
  showHistoryControls = false,
  onSnapshotChange,
}: {
  lang: Lang;
  /** Required when `showSeeAllLink` is `true` (default). The footer
   *  « Read the full briefing → » button calls `onNavigate("topArticles")`
   *  to switch the SPA to the dedicated /top-articles page. */
  onNavigate?: (page: AppNavPage) => void;
  /** Controlled « read » state of the hero. When `onToggleRead` is
   *  also provided (parent-controlled, v2.6.15+), the bottom-left of
   *  the card renders a compact « Lue / Read » checkbox. Currently
   *  driven by `BriefingPage` so it can demote the hero below the
   *  transcribed-videos list once the user checks it; other consumers
   *  (`/top-articles`, archive pages) leave both props undefined and
   *  the checkbox stays hidden. */
  isRead?: boolean;
  onToggleRead?: () => void;
  /** When provided (even as `null`), the component skips its self-fetch
   *  and uses the parent's snapshot directly. Lets the /top-articles
   *  page pass its own already-fetched snapshot so we don't duplicate
   *  the network call (the parent also needs the snapshot for its
   *  article list). When omitted, the component fetches on its own
   *  (the home use case). */
  data?: Snapshot | null;
  /** Default `true` (home use case). Set to `false` on the
   *  /top-articles page where the « Read the full briefing → » link
   *  would loop back to the same surface. */
  showSeeAllLink?: boolean;
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
  /** Notifies the parent each time the visible snapshot changes
   *  (initial load + every history-arrow navigation). v2.8.2+ used by
   *  `<HomeTop24hHero>` to know which `summaryDate` to look up in the
   *  per-user « Lu » DB-backed state, so the checkbox + collapse mirror
   *  the date currently on screen rather than always today's. */
  onSnapshotChange?: (snapshot: Snapshot) => void;
}) {
  const isSelfFetched = externalData === undefined;
  const [snapInternal, setSnapInternal] = useState<Snapshot | null>(null);
  const [loadingInternal, setLoadingInternal] = useState(isSelfFetched);
  const [errorInternal, setErrorInternal] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasOlder, setHistoryHasOlder] = useState(false);
  /** Mirrors `historyHasOlder` after each successful fetch — avoids a stale
   *  closure inside `setHistoryOffset` (the old `historyHasOlder ? o + 1`
   *  pattern could read `false` from the initial render and never
   *  increment even when the latest API said `hasOlder: true`). */
  const historyHasOlderRef = useRef(false);
  /** Latest `onSnapshotChange` callback. Kept in a ref so the fetch
   *  effect below doesn't need it as a dep — otherwise an unstable
   *  parent callback would re-trigger the network request on every
   *  parent render, which would also clobber the historyOffset state. */
  const onSnapshotChangeRef = useRef(onSnapshotChange);
  useEffect(() => {
    onSnapshotChangeRef.current = onSnapshotChange;
  }, [onSnapshotChange]);
  const snap = isSelfFetched ? snapInternal : externalData ?? null;

  // Reset the open-index set whenever the snapshot or `defaultOpen`
  // changes. When `defaultOpen=true` we open every group up front
  // (the /top-articles page wants the whole briefing visible); when
  // false we open none (the home accordion wants headlines only).
  // Manual toggle clicks update `openIdx` directly and aren't
  // overwritten because neither dep below changes on click.
  const groupCount = snap ? countGroups(snap.bullets) : 0;
  const [openIdx, setOpenIdx] = useState<Set<number>>(new Set());
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
    setLoadingInternal(true);
    setErrorInternal(false);
    fetch(`/api/news/top-summary/latest?lang=${lang}&offset=${historyOffset}`, { cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return null;
        if (r.status === 404) {
          if (offsetRequested > 0) {
            setHistoryOffset((o) => Math.max(0, o - 1));
            setErrorInternal(false);
          } else {
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
        onSnapshotChangeRef.current?.(json);
      })
      .catch(() => {
        if (cancelled) return;
        setErrorInternal(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingInternal(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSelfFetched, lang, historyOffset]);

  // Loading: discreet spinner that doesn't push the rest of the home
  // off-screen. ~80px tall is enough to feel like a placeholder while
  // remaining unobtrusive when the cron has nothing to show yet. Only
  // shown when self-fetching — when the parent drives `data`, it
  // owns its own loading skeleton.
  if (isSelfFetched && loadingInternal) {
    return (
      <section style={{ marginBottom: 36 }}>
        <div style={kickerStyle(color.gold)}>{t("top24hHeroKicker", lang)}</div>
        <div
          style={{
            ...card,
            padding: "26px 22px",
            borderColor: color.gold,
            background:
              "linear-gradient(180deg, rgba(201,162,39,0.04), transparent 60%), " + color.surface,
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
  const headingTitle = appendSummaryDateToTitle
    ? `${baseTitle} — ${formatSummaryDayLabel(snap.summaryDate, lang)}`
    : baseTitle;

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 12 }}>
        <div style={kickerStyle(color.gold)}>{t("top24hHeroKicker", lang)}</div>
        {showHistoryControls && isSelfFetched && (
          <Top24hHistoryArrows
            offset={historyOffset}
            canGoOlder={historyHasOlder}
            onOlder={() => {
              if (!historyHasOlderRef.current) return;
              trackEvent("top24h.history_older", {
                lang,
                meta: { fromOffset: historyOffset, fromDate: snap?.summaryDate ?? null },
              });
              setHistoryOffset((o) => o + 1);
            }}
            onNewer={() => {
              if (historyOffset === 0) return;
              trackEvent("top24h.history_newer", {
                lang,
                meta: { fromOffset: historyOffset, fromDate: snap?.summaryDate ?? null },
              });
              setHistoryOffset((o) => Math.max(0, o - 1));
            }}
            lang={lang}
          />
        )}
      </div>
      <div
        style={{
          ...card,
          padding: isRead ? "16px 22px 12px" : "22px 22px 16px",
          borderColor: color.gold,
          background:
            "linear-gradient(180deg, rgba(201,162,39,0.04), transparent 60%), " + color.surface,
          transition: "padding 280ms ease",
        }}
      >
        <div className="top24h-hero-header" style={{ marginBottom: isRead ? 4 : 14, transition: "margin-bottom 280ms ease" }}>
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
            {/* Master toggle. `allOpen` reflects « every group is
                expanded »; clicking flips the whole set in one
                update. Title attribute doubles as a tooltip for the
                desktop hover affordance. The button sits at the
                visual top-right of the card per the v2.6.13+ spec —
                same gold hover treatment as the per-row chevrons so
                the affordance reads as a single interaction family. */}
            {(() => {
              if (isRead) return null;
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
          <div
            className="top24h-hero-generated"
            style={{ color: color.textDim, fontSize: 12, letterSpacing: "0.02em" }}
          >
            {t("topSummaryGeneratedOn", lang).replace(
              "{date}",
              new Date(snap.generatedAt).toLocaleString(locale),
            )}
          </div>
        </div>

        {/* Collapsible body — audio player + bullet list. v2.7.7+ when
            `isRead` is true the wrapper animates to `max-height: 0` so
            the « Lu » checkbox demotes the briefing in place rather than
            being re-positioned somewhere else on the page. Audio stays
            mounted so an ongoing playback isn't interrupted by the
            collapse; `aria-hidden` is set so screen-readers skip the
            stale content while it's hidden. The 4000px ceiling is
            generous enough for any briefing payload we ship today
            (typically ~1400px) so the open animation finishes before
            the cap is reached on slow content. */}
        <div
          aria-hidden={isRead ? true : undefined}
          style={{
            maxHeight: isRead ? 0 : 4000,
            opacity: isRead ? 0 : 1,
            overflow: "hidden",
            visibility: isRead ? "hidden" : "visible",
            transition:
              "max-height 420ms cubic-bezier(0.33, 0.86, 0.22, 1), opacity 240ms ease, visibility 0s linear " +
              (isRead ? "420ms" : "0s"),
          }}
        >
        <Top24hAudio
          bullets={snap.bullets}
          lang={lang}
          date={snap.summaryDate}
        />

        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", borderTop: `1px solid ${color.border}` }}>
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
                      fontSize: 15,
                      fontWeight: 600,
                      letterSpacing: "-0.005em",
                      lineHeight: 1.35,
                      transition: "color 160ms ease",
                    }}
                  >
                    <span style={{ color: color.gold, flexShrink: 0, fontSize: 18, lineHeight: 1 }}>•</span>
                    <span style={{ flex: 1, minWidth: 0 }}>{g.title}</span>
                    {/* Editorial importance score 1-10 (mig. 026+).
                        Read off the first bullet of the group — every
                        bullet of a same-title run carries the same
                        value (propagated by `analyzeWithAI` flatten).
                        Hidden when the legacy column is missing or the
                        LLM omitted the score. Replaces the previous
                        paragraph-count badge in the same slot. */}
                    {(() => {
                      const score = g.bullets[0]?.importanceScore;
                      if (typeof score !== "number") return null;
                      return (
                        <span
                          style={{ flexShrink: 0, display: "inline-flex" }}
                          aria-label={`Importance ${score}/10`}
                        >
                          <ScoreMeter score={score} width={60} align="end" />
                        </span>
                      );
                    })()}
                    <span style={{ color: open ? color.gold : color.textMuted }}>
                      <Chevron open={open} />
                    </span>
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
                                {ref.source} <RefIcon />
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

        {/* Bottom action row: « Lue » checkbox on the left (when the
            parent opted in by passing `isRead` + `onToggleRead`) and
            the « Read the full briefing → » link on the right. Rendered
            as a single flex row so the two affordances sit side-by-side
            on a wide card; the row gracefully collapses when only one
            is present, keeping spacing balanced. */}
        {(onToggleRead || (showSeeAllLink && onNavigate)) && (
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            {onToggleRead ? (
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  color: isRead ? color.gold : color.textMuted,
                  fontSize: 13,
                  fontWeight: 500,
                  userSelect: "none",
                  transition: "color 140ms ease",
                }}
              >
                <input
                  type="checkbox"
                  checked={isRead ?? false}
                  onChange={onToggleRead}
                  // Pure native checkbox with the gold tint via
                  // `accentColor` — keeps the OS focus ring + a11y
                  // semantics without re-implementing a custom toggle.
                  style={{
                    width: 14,
                    height: 14,
                    margin: 0,
                    accentColor: color.gold,
                    cursor: "pointer",
                  }}
                />
                {t("top24hHeroReadLabel", lang)}
              </label>
            ) : (
              // Placeholder spacer so the see-all link stays right-aligned
              // when the checkbox is intentionally hidden (e.g. on
              // /top-articles). Zero-width div keeps `space-between`
              // semantics intact without altering the visual layout.
              <span />
            )}
            {showSeeAllLink && onNavigate && !isRead && (
              <button
                type="button"
                onClick={() => {
                  trackEvent("top24h.see_full_briefing", {
                    lang,
                    meta: { summaryDate: snap.summaryDate },
                  });
                  onNavigate("topArticles");
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: color.gold,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "4px 0",
                  letterSpacing: "0.01em",
                }}
              >
                {t("top24hHeroSeeAll", lang)}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
