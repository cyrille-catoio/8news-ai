"use client";

import dynamic from "next/dynamic";
import React from "react";
import { color } from "@/lib/theme";

/**
 * Dark-theme markdown renderer for the Daily Podcast chat bubbles.
 * Mirrors `VideoCardMarkdown` (lazy `react-markdown`, no SSR) but tuned
 * for chat density: tighter margins, gold links that open in a new tab
 * (the briefing cites source URLs the user will want to follow).
 */

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

const PLAIN_URL_RE = /https?:\/\/[^\s<>()\]]+/g;

function autoLinkPlainUrlsInText(text: string): string {
  return text.replace(PLAIN_URL_RE, (raw, offset, full) => {
    const prev = full[offset - 1];
    const prevPrev = full[offset - 2];
    if (prev === "<" || (prev === "(" && prevPrev === "]")) {
      return raw;
    }

    const trailing = raw.match(/[.,!?;:]+$/)?.[0] ?? "";
    const url = trailing ? raw.slice(0, -trailing.length) : raw;
    return `[${url}](${url})${trailing}`;
  });
}

/**
 * `react-markdown` renders markdown links as anchors but does not
 * auto-link bare URLs. The Daily Podcast chat often streams plain source
 * URLs from the model, so normalize those to markdown links before
 * rendering. We deliberately skip fenced and inline code, existing
 * markdown links (`[label](https://...)`) and autolinks
 * (`<https://...>`).
 */
export function autoLinkPlainUrls(source: string): string {
  let inFence = false;
  return source
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;

      return line
        .split(/(`[^`]*`)/g)
        .map((part) => (part.startsWith("`") ? part : autoLinkPlainUrlsInText(part)))
        .join("");
    })
    .join("\n");
}

const mdComponents = {
  h1: ({ children, ...props }: React.ComponentProps<"h1">) => (
    <h3 style={{ color: color.gold, fontWeight: 700, margin: "10px 0 6px", fontSize: 15 }} {...props}>{children}</h3>
  ),
  h2: ({ children, ...props }: React.ComponentProps<"h2">) => (
    <h3 style={{ color: color.gold, fontWeight: 700, margin: "10px 0 6px", fontSize: 15 }} {...props}>{children}</h3>
  ),
  h3: ({ children, ...props }: React.ComponentProps<"h3">) => (
    <h4 style={{ color: color.gold, fontWeight: 700, margin: "8px 0 4px", fontSize: 14 }} {...props}>{children}</h4>
  ),
  p: ({ children, ...props }: React.ComponentProps<"p">) => (
    <p style={{ color: color.textSecondary, margin: "6px 0", lineHeight: 1.55 }} {...props}>{children}</p>
  ),
  ul: ({ children, ...props }: React.ComponentProps<"ul">) => (
    <ul style={{ paddingLeft: 18, margin: "6px 0" }} {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }: React.ComponentProps<"ol">) => (
    <ol style={{ paddingLeft: 18, margin: "6px 0" }} {...props}>{children}</ol>
  ),
  li: ({ children, ...props }: React.ComponentProps<"li">) => (
    <li style={{ color: color.textSecondary, marginBottom: 4, lineHeight: 1.5 }} {...props}>{children}</li>
  ),
  strong: ({ children, ...props }: React.ComponentProps<"strong">) => (
    <strong style={{ color: color.text, fontWeight: 700 }} {...props}>{children}</strong>
  ),
  a: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: color.gold, textDecoration: "underline", wordBreak: "break-word" }}
    >
      {children}
    </a>
  ),
  code: ({ children, ...props }: React.ComponentProps<"code">) => (
    <code
      style={{
        background: "rgba(255,255,255,0.06)",
        borderRadius: 4,
        padding: "1px 5px",
        fontSize: 12,
        fontFamily: "ui-monospace, Menlo, monospace",
        color: color.text,
      }}
      {...props}
    >
      {children}
    </code>
  ),
};

export function PodcastChatMarkdown({ source }: { source: string }) {
  if (!source) return null;
  return <ReactMarkdown components={mdComponents}>{autoLinkPlainUrls(source)}</ReactMarkdown>;
}
