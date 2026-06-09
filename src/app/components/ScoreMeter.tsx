import type { CSSProperties } from "react";
import { color } from "@/lib/theme";
import { formatScore } from "@/lib/score-format";

/**
 * Score indicator: small mono score stacked just above a thin progress
 * bar, the two read as one unit. Tier coloring (green / gold / orange /
 * red) is shared between the number and the bar so the score's intensity
 * is legible at a glance.
 *
 * Same visual pattern as the landing hero's scoring console
 * ({@link landing.css `.score-meter` / `.score-num` / `.score-bar`}) but
 * defined inline here so consumers don't depend on the landing CSS scope.
 */
export function ScoreMeter({
  score,
  width = 60,
  align = "end",
}: {
  score: number;
  /** Width of the bar in pixels. Number aligns to the same edge as the bar. */
  width?: number;
  /** Horizontal alignment of the meter inside its parent. */
  align?: "start" | "end";
}) {
  const clamped = Math.max(0, Math.min(10, score));
  const ratio = clamped / 10;
  // Integer scores render without a decimal (« 8/10 »); fractional ones
  // — the 9-10 band for video recaps — keep one decimal (« 9.1/10 »).
  const scoreLabel = `${formatScore(clamped)}/10`;
  // v2.6.14+ green tier lowered 9 → 8 to recognize "strong signal"
  // editorial bullets and high-relevance articles that were previously
  // stuck in gold. Other thresholds unchanged.
  const tierColor =
    clamped >= 8 ? "#22c55e"        // green
      : clamped >= 5 ? color.gold     // gold
      : clamped >= 3 ? "#f97316"      // orange
      : "#ef4444";                    // red

  const wrap: CSSProperties = {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: align === "end" ? "flex-end" : "flex-start",
    gap: 4,
    minWidth: width,
    flexShrink: 0,
  };
  const num: CSSProperties = {
    fontFamily: "ui-monospace, Menlo, monospace",
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "0.02em",
    lineHeight: 1,
    color: tierColor,
  };
  const bar: CSSProperties = {
    width,
    height: 4,
    background: color.border,
    borderRadius: 2,
    overflow: "hidden",
    position: "relative",
  };
  const fill: CSSProperties = {
    display: "block",
    height: "100%",
    width: `${ratio * 100}%`,
    background: tierColor,
    borderRadius: 2,
  };

  return (
    <span style={wrap} aria-label={`Score ${scoreLabel}`}>
      <span style={num}>{scoreLabel}</span>
      <span style={bar} aria-hidden>
        <span style={fill} />
      </span>
    </span>
  );
}
