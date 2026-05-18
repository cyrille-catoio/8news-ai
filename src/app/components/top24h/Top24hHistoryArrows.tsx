"use client";

import { type CSSProperties } from "react";
import { color } from "@/lib/theme";
import { type Lang } from "@/lib/i18n";

/**
 * Twin chevrons rendered next to the kicker of `Top24hHero`. Lets the
 * visitor walk back through previously generated Top 24h snapshots
 * (older = ›, newer = ‹). The newer arrow is disabled once `offset` is
 * 0 (already on the current snapshot); the older arrow is disabled
 * when `canGoOlder` is false (no more rows in `top_summaries`).
 *
 * The styling matches the rest of the gold-on-low-contrast control
 * cluster on the home — buttons are barely visible at rest, gold on
 * hover, fully transparent when disabled.
 *
 * v2.12 extracted from `src/app/components/Top24hHero.tsx`. No
 * behavior change.
 */
export function Top24hHistoryArrows({
  offset,
  canGoOlder,
  onOlder,
  onNewer,
  lang,
}: {
  offset: number;
  canGoOlder: boolean;
  onOlder: () => void;
  onNewer: () => void;
  lang: Lang;
}) {
  const canGoNewer = offset > 0;
  const baseBtn: CSSProperties = {
    background: "rgba(255,255,255,0.02)",
    border: `1px solid ${color.border}`,
    borderRadius: 6,
    color: color.textDim,
    cursor: "pointer",
    fontSize: 20,
    lineHeight: 1,
    padding: "4px 8px",
    minWidth: 30,
    minHeight: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "color 120ms ease, opacity 120ms ease, border-color 120ms ease, background 120ms ease",
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, marginLeft: 10 }}>
      <button
        type="button"
        onClick={onNewer}
        disabled={!canGoNewer}
        aria-label={lang === "fr" ? "Podcast plus récent" : "Newer podcast"}
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
        onClick={onOlder}
        disabled={!canGoOlder}
        aria-label={lang === "fr" ? "Podcast précédent" : "Previous podcast"}
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
    </span>
  );
}
