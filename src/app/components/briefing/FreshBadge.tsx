"use client";

import { color } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";

/**
 * Small gold « NEW / NOUVEAU » pill flagging items published in the last
 * few hours. Used on the home briefing (Top story, Top 5) so a daily
 * reader spots fresh stories at a glance. Render conditionally — the
 * caller decides freshness via `isFresh()` (briefing/utils).
 */
export function FreshBadge({ lang }: { lang: Lang }) {
  return (
    <span
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.08em",
        color: "#000",
        background: color.gold,
        borderRadius: 4,
        padding: "1px 5px",
        lineHeight: 1.4,
        textTransform: "uppercase",
      }}
    >
      {lang === "fr" ? "Nouveau" : "New"}
    </span>
  );
}
