"use client";

/**
 * SVG glyphs used by `Top24hHero` — pure presentational components
 * with no business logic. Kept as separate exports so the parent stays
 * focused on the accordion/state machine.
 *
 * v2.12 extracted from `src/app/components/Top24hHero.tsx`.
 */

/** Single chevron rotating 180° when its row is expanded. */
export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        flexShrink: 0,
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 180ms ease",
      }}
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/** Double-chevron glyph used by the « expand/collapse all » master
 *  toggle pinned at the top-right of the hero. Two stacked chevrons
 *  read as « all rows » where the single-chevron pattern on each row
 *  reads as « this row only » — distinct affordance for distinct
 *  scope. Rotates 180° when every group is open so the same SVG
 *  serves both directions, animated for continuity. */
export function DoubleChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        flexShrink: 0,
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 220ms ease",
      }}
      aria-hidden
    >
      <polyline points="7 13 12 18 17 13" />
      <polyline points="7 6 12 11 17 6" />
    </svg>
  );
}

/** External-link glyph rendered next to each ref in a bullet's source
 *  list. Low opacity by design — the visual weight should stay on the
 *  source name itself, not on the icon. */
export function RefIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", opacity: 0.6 }}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
