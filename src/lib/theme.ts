import type { CSSProperties } from "react";

export const color = {
  bg: "#000000",
  surface: "#111",
  surfaceHover: "#191919",
  border: "#2a2a2a",
  borderLight: "#333",
  gold: "#c9a227",
  goldLight: "#e6c84e",
  text: "#f5f5f5",
  textSecondary: "#ddd",
  textMuted: "#999",
  articleSnippet: "#b0b0b0",
  textDim: "#666",
  textLabel: "#aaa",
  errorBg: "rgba(200,50,50,0.1)",
  errorBorder: "rgba(200,50,50,0.3)",
  errorText: "#ff8888",
} as const;

export const font = {
  base: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;

export const sectionHeading: CSSProperties = {
  color: color.gold,
  fontSize: 13,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginBottom: 12,
  marginTop: 0,
};

export const card: CSSProperties = {
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: 10,
  padding: 16,
  marginBottom: 12,
};

/** Section panel (stats, cron monitor, topics admin blocks). */
export const sectionCard: CSSProperties = {
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: 10,
  padding: "16px 20px",
  marginBottom: 16,
};

/** Uppercase gold heading inside `sectionCard` (topics forms). */
export const formSectionTitle: CSSProperties = {
  color: color.gold,
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 14,
  marginTop: 0,
};

/** Full-width inputs in topic create/edit forms. */
export const formInputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  border: `1px solid ${color.border}`,
  background: color.surface,
  color: color.text,
  fontSize: 13,
  boxSizing: "border-box",
};

export const formTextareaStyle: CSSProperties = {
  ...formInputStyle,
  minHeight: 60,
  resize: "vertical",
};

export const primaryButtonStyle: CSSProperties = {
  padding: "8px 20px",
  borderRadius: 6,
  border: "none",
  background: color.gold,
  color: "#000",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

/**
 * Rounded rectangular CTA with a gold outline on a transparent (black)
 * background, gold text. Mirrors the chrome of the main app header
 * (EN/FR toggle, « Sign in » button, top icons) so the on-card CTAs —
 * « Lire l'article », « Play Vidéo », « Résumé », « Ouvrir sur YouTube »
 * — read as part of the same affordance family rather than as bright
 * « buy » buttons. Hover behaviour is opt-in via inline JSX (a soft
 * gold tint background); keeping the rest-state declarative here lets
 * every CTA share the same baseline metrics.
 *
 * v2.12.1+: introduced when the in-card action buttons were switched
 * from filled gold (black text) to outline gold for visual coherence
 * with the top nav.
 */
export const outlinedButtonStyle: CSSProperties = {
  padding: "8px 16px",
  borderRadius: 6,
  border: `1px solid ${color.gold}`,
  background: "transparent",
  color: color.gold,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "background 140ms ease, border-color 140ms ease",
};

export const dangerButtonStyle: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "none",
  background: "transparent",
  color: "#ef4444",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

/** Relevance score 1–10 (stats KPIs, feed admin, rankings). */
export function scoreClr(s: number): string {
  return s >= 7 ? "#4ade80" : s >= 5 ? color.gold : s >= 3 ? "#f97316" : "#ff8888";
}

/** Hit rate % (articles scoring ≥7 / scored). */
export function hitClr(r: number): string {
  return r >= 50 ? "#4ade80" : r >= 30 ? color.gold : "#ff8888";
}

/** Coverage % (scored / total). Same thresholds for stats and feed admin. */
export function covClr(p: number): string {
  return p >= 90 ? "#4ade80" : p >= 70 ? color.gold : "#ff8888";
}

/** KPI tile (Stats page, Cron monitor). Pair with a local value style. */
export const kpiCard: CSSProperties = {
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  padding: "10px 6px",
  textAlign: "center",
};

/** Uppercase muted label under a KPI value. */
export const kpiLbl: CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: color.textMuted,
  marginTop: 2,
};

/** Minimal text-style button (reorder arrows, etc.). */
export const ghostBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: color.textMuted,
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  padding: "2px 5px",
  borderRadius: 4,
};

/** Bordered ghost control (Topics admin panel). */
export const ghostOutlineBtn: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: `1px solid ${color.border}`,
  background: "transparent",
  color: color.textMuted,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

export function spinnerStyle(
  size: number,
  opts?: {
    borderWidth?: number;
    marginLeft?: number | string;
    marginRight?: number | string;
    flexShrink?: number;
    verticalAlign?: CSSProperties["verticalAlign"];
  },
): CSSProperties {
  const bw = opts?.borderWidth ?? 3;
  const { marginLeft, marginRight, flexShrink, verticalAlign } = opts ?? {};
  return {
    display: "inline-block",
    width: size,
    height: size,
    boxSizing: "border-box",
    border: `${bw}px solid ${color.gold}`,
    borderTop: `${bw}px solid transparent`,
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    ...(marginLeft !== undefined ? { marginLeft } : {}),
    ...(marginRight !== undefined ? { marginRight } : {}),
    ...(flexShrink !== undefined ? { flexShrink } : {}),
    ...(verticalAlign !== undefined ? { verticalAlign } : {}),
  };
}
