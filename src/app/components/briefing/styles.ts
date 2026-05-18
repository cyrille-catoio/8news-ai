/**
 * Shared style tokens for BriefingPage sub-components.
 *
 * Extracted v2.12 from the monolithic `BriefingPage.tsx`. Same shape
 * the orchestrator used inline; importing instead of duplicating keeps
 * the gold mono kicker register identical across every section.
 */

import type { CSSProperties } from "react";
import { color } from "@/lib/theme";

/** Mono uppercase gold kicker — the visual register used above every
 *  briefing section (TOP VIDEO · NOW, BRIEFING DU JOUR, TENDANCES,
 *  VOS TOPICS, etc.). */
export function kicker(c: string): CSSProperties {
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

/** Gold underlined inline CTA link (« Voir le top 50 → », « See all → »…). */
export const ctaLink: CSSProperties = {
  background: "transparent",
  border: "none",
  color: color.gold,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
  fontFamily: "inherit",
  textDecoration: "underline",
  marginTop: 6,
};
