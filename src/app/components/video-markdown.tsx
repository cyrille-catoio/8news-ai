"use client";

import dynamic from "next/dynamic";
import React from "react";
import { color } from "@/lib/theme";

/**
 * Shared dark-theme react-markdown overrides for video summaries, in two
 * size variants (merged from `VideoCardMarkdown.tsx` and
 * `video-page-markdown.tsx`, which were ~80 % identical):
 *
 *  - `"card"` — compact, used inside the expanded summary panel of
 *    `VideoCard`. Sizing is delegated to the `app-title` /
 *    `app-paragraph` utility classes so the card inherits the SPA's
 *    responsive typography.
 *  - `"page"` — larger, explicit font sizes, uppercase `h2`. Used by the
 *    per-video SSR pages (`/v/`) via `VideoPageSummary`.
 *
 * `PodcastChatMarkdown` stays separate on purpose (chat-bubble tuning).
 */

type Variant = "card" | "page";

function buildMdComponents(variant: Variant) {
  const isPage = variant === "page";
  const cls = isPage ? undefined : { title: "app-title", body: "app-paragraph" };

  const h2Style: React.CSSProperties = isPage
    ? { color: color.gold, fontSize: 18, fontWeight: 700, margin: "24px 0 10px", textTransform: "uppercase" }
    : { color: color.gold, fontWeight: 700, margin: "18px 0 8px" };
  // h3 is the per-key-point title (promoted from `- **Title**` bullets by
  // `promoteBulletTitlesToHeadings`). Gold to match the roundup pages'
  // bullet titles across briefings and per-video summaries.
  const h3Style: React.CSSProperties = isPage
    ? { color: color.gold, fontSize: 17, fontWeight: 700, lineHeight: 1.35, margin: "20px 0 4px" }
    : { color: color.gold, fontWeight: 700, margin: "14px 0 4px" };
  const pStyle: React.CSSProperties = isPage
    ? { color: color.textSecondary, fontSize: 15, lineHeight: 1.6, margin: "8px 0" }
    : { color: color.textSecondary, margin: "6px 0" };
  const ulStyle: React.CSSProperties = isPage
    ? { paddingLeft: 22, margin: "8px 0" }
    : { paddingLeft: 20, margin: "6px 0" };
  const liStyle: React.CSSProperties = isPage
    ? { color: color.textSecondary, fontSize: 15, lineHeight: 1.6, marginBottom: 10 }
    : { color: color.textSecondary, marginBottom: 8 };

  return {
    h2: ({ children, ...props }: React.ComponentProps<"h2">) => (
      <h2 className={cls?.title} style={h2Style} {...props}>{children}</h2>
    ),
    h3: ({ children, ...props }: React.ComponentProps<"h3">) => (
      <h3 className={cls?.title} style={h3Style} {...props}>{children}</h3>
    ),
    p: ({ children, ...props }: React.ComponentProps<"p">) => (
      <p className={cls?.body} style={pStyle} {...props}>{children}</p>
    ),
    ul: ({ children, ...props }: React.ComponentProps<"ul">) => (
      <ul style={ulStyle} {...props}>{children}</ul>
    ),
    li: ({ children, ...props }: React.ComponentProps<"li">) => (
      <li className={cls?.body} style={liStyle} {...props}>{children}</li>
    ),
    strong: ({ children, ...props }: React.ComponentProps<"strong">) => (
      <strong style={{ color: color.text, fontWeight: 700 }} {...props}>{children}</strong>
    ),
  };
}

/** Overrides for per-video SSR pages (`/v/`) — explicit sizes, uppercase h2. */
export const videoPageMdComponents = buildMdComponents("page");

const videoCardMdComponents = buildMdComponents("card");

// Lazy-loaded, no SSR — react-markdown's bundle is heavy and the card
// variant only mounts when the user actually opens a summary panel.
const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

/** Render the given markdown source with the compact card overrides.
 *  Returns null for empty / nullish input so the caller can render it
 *  unconditionally. */
export function VideoCardMarkdown({ source }: { source: string | null | undefined }) {
  if (!source) return null;
  return <ReactMarkdown components={videoCardMdComponents}>{source}</ReactMarkdown>;
}
