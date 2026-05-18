"use client";

import { type CSSProperties } from "react";
import { color } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";

/**
 * Bottom-of-briefing CTA row: Personnaliser mes topics (authed only) /
 * Résumés quotidiens / Toutes les vidéos.
 *
 * v2.12 extracted from `BriefingPage.tsx`.
 */
export function FooterCTAs({
  lang,
  isAuthenticated,
  onPersonalize,
  onSummaries,
  onVideos,
}: {
  lang: Lang;
  isAuthenticated: boolean;
  onPersonalize: () => void;
  onSummaries: () => void;
  onVideos: () => void;
}) {
  const ctaBtn: CSSProperties = {
    padding: "10px 16px",
    border: `1px solid ${color.border}`,
    borderRadius: 6,
    background: "transparent",
    color: color.gold,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
  };
  return (
    <section
      style={{
        marginTop: 16,
        paddingTop: 20,
        borderTop: `1px solid ${color.border}`,
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      {isAuthenticated && (
        <button type="button" onClick={onPersonalize} style={ctaBtn}>
          {lang === "fr" ? "Personnaliser mes topics" : "Customize my topics"}
        </button>
      )}
      <button type="button" onClick={onSummaries} style={ctaBtn}>
        {lang === "fr" ? "Résumés quotidiens" : "Daily summaries"}
      </button>
      <button type="button" onClick={onVideos} style={ctaBtn}>
        {lang === "fr" ? "Toutes les vidéos" : "All videos"}
      </button>
    </section>
  );
}
