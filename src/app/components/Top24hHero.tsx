"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { color, card, spinnerStyle } from "@/lib/theme";
import { t, type Lang, dateLocale } from "@/lib/i18n";
import type { AppNavPage } from "@/app/components/AppHeader";

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

interface Bullet {
  text: string;
  title?: string | null;
  refs: Array<{ title: string; link: string; source: string }>;
}

interface Snapshot {
  bullets: Bullet[];
  summaryDate: string;
  generatedAt: string;
}

interface Group {
  /** Empty string means « no title » (legacy bullets) — rendered as a
   *  plain non-collapsible row. */
  title: string;
  bullets: Bullet[];
}

/** Fold consecutive bullets that share the same title into a single
 *  thematic group. Bullets without a title each become their own
 *  empty-titled group so they keep their place in the list without
 *  pretending to be collapsible. */
function groupBullets(bullets: Bullet[]): Group[] {
  const out: Group[] = [];
  for (const b of bullets) {
    const t = (b.title ?? "").trim();
    if (!t) {
      out.push({ title: "", bullets: [b] });
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.title === t) last.bullets.push(b);
    else out.push({ title: t, bullets: [b] });
  }
  return out;
}

/** Number of groups produced by `groupBullets` without allocating the
 *  full Group array — useful to size the initial `openIdx` Set when
 *  `defaultOpen` is true (the actual array gets built once below). */
function countGroups(bullets: Bullet[]): number {
  let n = 0;
  let prev: string | null = null;
  for (const b of bullets) {
    const t = (b.title ?? "").trim();
    if (!t) {
      n += 1;
      prev = null;
      continue;
    }
    if (t !== prev) {
      n += 1;
      prev = t;
    }
  }
  return n;
}

/** Inline kicker style (matches the rest of `BriefingPage`'s sections
 *  — gold mono uppercase, low contrast). Duplicated here on purpose
 *  so the component stays self-contained and importable from any
 *  surface, not just BriefingPage. */
function kickerStyle(c: string): CSSProperties {
  return {
    color: c,
    fontFamily: "ui-monospace, Menlo, monospace",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    marginBottom: 8,
  };
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        flexShrink: 0,
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 180ms ease",
      }}
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function RefIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", opacity: 0.6 }}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function Top24hHero({
  lang,
  onNavigate,
  data: externalData,
  showSeeAllLink = true,
  defaultOpen = false,
}: {
  lang: Lang;
  /** Required when `showSeeAllLink` is `true` (default). The footer
   *  « Read the full briefing → » button calls `onNavigate("topArticles")`
   *  to switch the SPA to the dedicated /top-articles page. */
  onNavigate?: (page: AppNavPage) => void;
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
}) {
  const isSelfFetched = externalData === undefined;
  const [snapInternal, setSnapInternal] = useState<Snapshot | null>(null);
  const [loadingInternal, setLoadingInternal] = useState(isSelfFetched);
  const [errorInternal, setErrorInternal] = useState(false);
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

  useEffect(() => {
    if (!isSelfFetched) return;
    let cancelled = false;
    setLoadingInternal(true);
    setErrorInternal(false);
    fetch(`/api/news/top-summary/latest?lang=${lang}`, { cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return null;
        if (r.status === 404) {
          setErrorInternal(true);
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as Snapshot;
      })
      .then((json) => {
        if (cancelled || !json) return;
        setSnapInternal(json);
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
  }, [isSelfFetched, lang]);

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
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const locale = dateLocale(lang);

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={kickerStyle(color.gold)}>{t("top24hHeroKicker", lang)}</div>
      <div
        style={{
          ...card,
          padding: "22px 22px 16px",
          borderColor: color.gold,
          background:
            "linear-gradient(180deg, rgba(201,162,39,0.04), transparent 60%), " + color.surface,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
          <h2
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
            {t("top24hHeroTitle", lang)}
          </h2>
          <div style={{ color: color.textDim, fontSize: 12, letterSpacing: "0.02em" }}>
            {t("topSummaryGeneratedOn", lang).replace(
              "{date}",
              new Date(snap.generatedAt).toLocaleString(locale),
            )}
          </div>
        </div>

        <div
          style={{
            color: color.textMuted,
            fontSize: 13,
            marginBottom: 14,
            fontStyle: "italic",
          }}
        >
          {t("top24hHeroSubtitle", lang)}
        </div>

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
                    {g.bullets.length > 1 && (
                      <span
                        style={{
                          color: color.textDim,
                          fontFamily: "ui-monospace, Menlo, monospace",
                          fontSize: 11,
                          flexShrink: 0,
                        }}
                      >
                        {g.bullets.length}
                      </span>
                    )}
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
                    style={{
                      padding: "4px 4px 16px 26px",
                      animation: "top24hExpandFade 220ms ease-out both",
                    }}
                  >
                    {g.bullets.map((b, j) => (
                      <div
                        key={j}
                        style={{
                          color: color.textSecondary,
                          fontSize: 14,
                          lineHeight: 1.55,
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

        {showSeeAllLink && onNavigate && (
          <div style={{ marginTop: 14, textAlign: "right" }}>
            <button
              type="button"
              onClick={() => onNavigate("topArticles")}
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
          </div>
        )}
      </div>
    </section>
  );
}
