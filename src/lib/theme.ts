import type { CSSProperties } from "react";

export const color = {
  bg: "#0a0a0a",
  surface: "#111",
  surfaceHover: "#191919",
  border: "#2a2a2a",
  borderLight: "#333",
  gold: "#c9a227",
  goldLight: "#e6c84e",
  text: "#f5f5f5",
  textSecondary: "#ddd",
  textMuted: "#888",
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
  fontSize: 12,
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
