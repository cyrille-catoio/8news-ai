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
}: {
  lang: Lang;
  onNavigate: (page: AppNavPage) => void;
}) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openIdx, setOpenIdx] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/news/top-summary/latest?lang=${lang}`, { cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return null;
        if (r.status === 404) {
          setError(true);
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as Snapshot;
      })
      .then((json) => {
        if (cancelled || !json) return;
        setSnap(json);
        setOpenIdx(new Set());
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  // Loading: discreet spinner that doesn't push the rest of the home
  // off-screen. ~80px tall is enough to feel like a placeholder while
  // remaining unobtrusive when the cron has nothing to show yet.
  if (loading) {
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

  // Hide on error / 404 — the home shouldn't display an empty-state
  // copy in the visitor's #1 above-the-fold slot. /top-articles owns
  // that messaging.
  if (error || !snap) return null;

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
                              gap: 10,
                              marginTop: 4,
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
                                style={{
                                  color: color.textDim,
                                  fontSize: 11,
                                  textDecoration: "none",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 3,
                                  transition: "color 0.15s",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = color.gold)}
                                onMouseLeave={(e) => (e.currentTarget.style.color = color.textDim)}
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
      </div>
    </section>
  );
}
