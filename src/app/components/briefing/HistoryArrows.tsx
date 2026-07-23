"use client";

import { type CSSProperties } from "react";
import { color } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";

/**
 * Newer / older history chevrons used on the Top Stories page (Top Story,
 * Top Video) and the home Top 24h (Daily Podcast) hero. v2.12 extracted
 * from `BriefingPage.tsx`; the Top 24h hero's near-identical copy
 * (`Top24hHistoryArrows`) was merged into this one — pass
 * `newerLabel` / `olderLabel` to override the default aria-labels.
 * Pass `withLabels` to render visible « Previous / Next » text inside the
 * buttons (Top Stories page) instead of bare chevrons.
 */
export function HistoryArrows({
  offset,
  canGoOlder,
  onPrev,
  onNext,
  lang,
  newerLabel,
  olderLabel,
  withLabels,
}: {
  offset: number;
  canGoOlder: boolean;
  onPrev: () => void;
  onNext: () => void;
  lang: Lang;
  /** Optional aria-label override for the « newer » chevron. */
  newerLabel?: string;
  /** Optional aria-label override for the « older » chevron. */
  olderLabel?: string;
  /** Render visible text labels next to the chevrons. */
  withLabels?: boolean;
}) {
  const canGoNewer = offset > 0;
  // Reading direction is « now → past »: the right button advances to the
  // next (older) pick, the left one walks back toward the live pick.
  // Wording matches the Daily Podcast fullscreen reader nav.
  const prevText = lang === "fr" ? "Précédent" : "Previous";
  const nextText = lang === "fr" ? "Suivant" : "Next";
  // Match the visible "fold/unfold" affordance used elsewhere: bordered
  // hit-targets with gold hover, instead of bare low-contrast glyphs.
  const baseBtn: CSSProperties = {
    background: "rgba(255,255,255,0.02)",
    border: `1px solid ${color.border}`,
    borderRadius: 6,
    color: color.textDim,
    fontSize: withLabels ? 12 : 20,
    lineHeight: 1,
    fontFamily: "inherit",
    padding: withLabels ? "6px 10px" : "4px 8px",
    cursor: "pointer",
    minWidth: 30,
    minHeight: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    whiteSpace: "nowrap",
    transition: "color 120ms ease, opacity 120ms ease, border-color 120ms ease, background 120ms ease",
    // Negative top offset compensates for the chevron glyph's intrinsic
    // top whitespace inside its own line-box, pulling the visible
    // character down to sit on the kicker's text baseline.
    position: "relative",
    top: 1,
  };
  const chevronStyle: CSSProperties = withLabels ? { fontSize: 16, lineHeight: 1 } : {};
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 6,
        marginLeft: 10,
      }}
    >
      {/* Left chevron walks toward « now » (newer / back to live);
          right chevron walks toward the past (older). Mirrors the
          natural reading direction « now → past » that the product
          team validated for the home rotation. */}
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNewer}
        aria-label={newerLabel ?? (lang === "fr" ? "Plus récent" : "Newer")}
        style={{
          ...baseBtn,
          opacity: canGoNewer ? 1 : 0.32,
          cursor: canGoNewer ? "pointer" : "not-allowed",
        }}
        onMouseEnter={(e) => {
          if (!canGoNewer) return;
          e.currentTarget.style.color = color.gold;
          e.currentTarget.style.borderColor = color.gold;
          e.currentTarget.style.background = "rgba(201,162,39,0.10)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = color.textDim;
          e.currentTarget.style.borderColor = color.border;
          e.currentTarget.style.background = "rgba(255,255,255,0.02)";
        }}
      >
        <span aria-hidden="true" style={chevronStyle}>‹</span>
        {withLabels && <span>{prevText}</span>}
      </button>
      <button
        type="button"
        onClick={onPrev}
        disabled={!canGoOlder}
        aria-label={olderLabel ?? (lang === "fr" ? "Plus ancien" : "Older")}
        style={{
          ...baseBtn,
          opacity: canGoOlder ? 1 : 0.32,
          cursor: canGoOlder ? "pointer" : "not-allowed",
        }}
        onMouseEnter={(e) => {
          if (!canGoOlder) return;
          e.currentTarget.style.color = color.gold;
          e.currentTarget.style.borderColor = color.gold;
          e.currentTarget.style.background = "rgba(201,162,39,0.10)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = color.textDim;
          e.currentTarget.style.borderColor = color.border;
          e.currentTarget.style.background = "rgba(255,255,255,0.02)";
        }}
      >
        {withLabels && <span>{nextText}</span>}
        <span aria-hidden="true" style={chevronStyle}>›</span>
      </button>
    </div>
  );
}
