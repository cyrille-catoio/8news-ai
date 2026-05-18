"use client";

import dynamic from "next/dynamic";
import React from "react";
import { color } from "@/lib/theme";

/**
 * Dark-theme markdown renderer used inside the expanded summary panel
 * of `VideoCard`. Wraps `react-markdown` (lazy-loaded, no SSR — its
 * bundle is heavy and only mounts when the user actually opens a
 * summary) with style overrides matching the rest of the app's
 * editorial layer (gold titles, low-contrast body, narrow-padded
 * bullets).
 *
 * v2.12 extracted from `src/app/components/VideoCard.tsx`. The
 * `mdComponents` map below is the same one previously inlined.
 */

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

const mdComponents = {
  h2: ({ children, ...props }: React.ComponentProps<"h2">) => (
    <h2 className="app-title" style={{ color: color.gold, fontWeight: 700, margin: "18px 0 8px" }} {...props}>{children}</h2>
  ),
  // h3 is the per-key-point title (promoted from `- **Title**` bullets by
  // `promoteBulletTitlesToHeadings`). Styled in gold to match the roundup
  // pages' bullet titles for visual consistency across briefings and
  // per-video summaries.
  h3: ({ children, ...props }: React.ComponentProps<"h3">) => (
    <h3 className="app-title" style={{ color: color.gold, fontWeight: 700, margin: "14px 0 4px" }} {...props}>{children}</h3>
  ),
  p: ({ children, ...props }: React.ComponentProps<"p">) => (
    <p className="app-paragraph" style={{ color: color.textSecondary, margin: "6px 0" }} {...props}>{children}</p>
  ),
  ul: ({ children, ...props }: React.ComponentProps<"ul">) => (
    <ul style={{ paddingLeft: 20, margin: "6px 0" }} {...props}>{children}</ul>
  ),
  li: ({ children, ...props }: React.ComponentProps<"li">) => (
    <li className="app-paragraph" style={{ color: color.textSecondary, marginBottom: 8 }} {...props}>{children}</li>
  ),
  strong: ({ children, ...props }: React.ComponentProps<"strong">) => (
    <strong style={{ color: color.text, fontWeight: 700 }} {...props}>{children}</strong>
  ),
};

/** Render the given markdown source with the dark-theme component
 *  overrides applied. Returns null for empty / nullish input so the
 *  caller can render it unconditionally. */
export function VideoCardMarkdown({ source }: { source: string | null | undefined }) {
  if (!source) return null;
  return <ReactMarkdown components={mdComponents}>{source}</ReactMarkdown>;
}
