"use client";

import { type CSSProperties } from "react";
import { color } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";

/**
 * Newer / older history chevrons used on the home Top Story and
 * Top Video heroes. v2.12 extracted from `BriefingPage.tsx` — same
 * visual register as the Top 24h hero's `Top24hHistoryArrows` (which
 * lives next to its own component because it interacts with its
 * internal `historyOffset` state).
 */
export function HistoryArrows({
  offset,
  canGoOlder,
  onPrev,
  onNext,
  lang,
}: {
  offset: number;
  canGoOlder: boolean;
  onPrev: () => void;
  onNext: () => void;
  lang: Lang;
}) {
  const canGoNewer = offset > 0;
  // Match the visible "fold/unfold" affordance used elsewhere: bordered
  // hit-targets with gold hover, instead of bare low-contrast glyphs.
  const baseBtn: CSSProperties = {
    background: "rgba(255,255,255,0.02)",
    border: `1px solid ${color.border}`,
    borderRadius: 6,
    color: color.textDim,
    fontSize: 20,
    lineHeight: 1,
    fontFamily: "inherit",
    padding: "4px 8px",
    cursor: "pointer",
    minWidth: 30,
    minHeight: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "color 120ms ease, opacity 120ms ease, border-color 120ms ease, background 120ms ease",
    // Negative top offset compensates for the chevron glyph's intrinsic
    // top whitespace inside its own line-box, pulling the visible
    // character down to sit on the kicker's text baseline.
    position: "relative",
    top: 1,
  };
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
        aria-label={lang === "fr" ? "Plus récent" : "Newer"}
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
        ‹
      </button>
      <button
        type="button"
        onClick={onPrev}
        disabled={!canGoOlder}
        aria-label={lang === "fr" ? "Plus ancien" : "Older"}
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
        ›
      </button>
    </div>
  );
}
