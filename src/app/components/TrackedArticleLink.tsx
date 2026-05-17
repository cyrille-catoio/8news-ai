"use client";

import { type ReactNode, type CSSProperties } from "react";
import { trackEvent } from "@/lib/track";
import type { Lang } from "@/lib/i18n";

/**
 * Wrapper around `<a href={article}>` that fires an `article.link_click`
 * event before the navigation. Use everywhere an external article URL
 * is presented to the user so the « top read content » section of the
 * admin User Activity dashboard can aggregate clicks by URL.
 *
 * Passes through `target="_blank" rel="noopener noreferrer"` by default
 * — most callers want outbound clicks in a new tab. Override via props
 * when needed.
 *
 * The tracking is fire-and-forget (the `trackEvent` queue flushes
 * within 5 s or on pagehide), so even when the browser tears down the
 * tab to load the destination the event still ships via sendBeacon.
 */
export function TrackedArticleLink({
  href,
  section,
  source,
  score,
  lang,
  children,
  style,
  className,
  target = "_blank",
  rel = "noopener noreferrer",
  title,
  ariaLabel,
}: {
  href: string;
  /** Which surface the click happened on (`'top_5'`, `'top_50'`, `'trending'`, `'your_topics'`, `'hero_top_story'`…). Recorded in `meta.section`. */
  section: string;
  /** Optional source name (publication) for richer attribution. */
  source?: string;
  /** Optional article score 0-10. Helps correlate « do high-scored articles get more clicks? ». */
  score?: number | null;
  lang: Lang;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  target?: string;
  rel?: string;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <a
      href={href}
      target={target}
      rel={rel}
      style={style}
      className={className}
      title={title}
      aria-label={ariaLabel}
      onClick={() =>
        trackEvent("article.link_click", {
          target_id: href,
          lang,
          meta: { section, source, score: score ?? null },
        })
      }
    >
      {children}
    </a>
  );
}
