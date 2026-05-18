"use client";

import { color, card, spinnerStyle } from "@/lib/theme";
import { kicker } from "@/app/components/briefing/styles";

/**
 * Section spinner placeholder.
 *
 * Shown while a section's data is still being fetched. Keeps the kicker
 * (so the user can already see what's coming) and renders a small
 * centered spinner card underneath. Same outer marginBottom as the
 * other sections so the layout doesn't jump when the real content
 * replaces the placeholder.
 *
 * v2.12 extracted from `BriefingPage.tsx`.
 */
export function SectionSpinner({
  label,
  goldBorder = false,
}: {
  label: string;
  /** When true, use the same gold frame as Top story / Top video cards. */
  goldBorder?: boolean;
}) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ ...kicker(color.gold), marginBottom: 12 }}>{label}</div>
      <div
        style={{
          ...card,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 16px",
          minHeight: 92,
          ...(goldBorder
            ? {
                borderColor: color.gold,
                background:
                  "linear-gradient(180deg, rgba(201,162,39,0.04), transparent 60%), " +
                  color.surface,
              }
            : {}),
        }}
        aria-busy="true"
        aria-live="polite"
      >
        <span style={spinnerStyle(22)} aria-hidden />
      </div>
    </section>
  );
}
