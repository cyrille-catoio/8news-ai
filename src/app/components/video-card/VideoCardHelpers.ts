import { type CSSProperties } from "react";
import { color } from "@/lib/theme";
import type { VideoItem } from "@/lib/types";

/**
 * Pure helpers used by `VideoCard` — content normalization (markdown
 * preview, transcription-error detection), display formatting (views,
 * duration), and the « See more » toggle link style.
 *
 * v2.12 extracted from `src/app/components/VideoCard.tsx`. The
 * `VIDEO_SUMMARY_*` animation constants stay alongside the component
 * because they read better next to the JSX that consumes them, but
 * everything below is portable and side-effect-free.
 */

/** Chars after which the description gets truncated with a « See more »
 *  toggle in the card body. */
export const DESC_MAX = 120;

/** Internal SSR page URL when the video has been transcribed with a topic + slug. */
export function videoSsrHref(
  v: Pick<VideoItem, "topicId" | "slugKeywords" | "publishedDate">,
): string | null {
  if (v.topicId && v.slugKeywords && v.publishedDate) {
    return `/${v.topicId}/v/${v.publishedDate}/${v.slugKeywords}`;
  }
  return null;
}

/**
 * Strip markdown formatting from the AI summary and return a clean
 * teaser snippet (first words, ≤ `maxChars`) suitable for the
 * homepage hero side panel — no headings, no bullets, no `**`.
 */
export function buildSummaryPreview(md: string | null, maxChars = 240): string {
  if (!md) return "";
  const plain = md
    .replace(/^##\s+.+$/gm, "")     // drop ## section markers (whole line)
    .replace(/^###\s+/gm, "")       // strip ### prefix, keep title text
    .replace(/\*\*/g, "")           // remove bold markers
    .replace(/^\s*[-*]\s+/gm, "")   // strip leading list bullets
    .replace(/\n+/g, " ")           // collapse newlines into spaces
    .replace(/\s{2,}/g, " ")
    .trim();
  if (plain.length <= maxChars) return plain;
  const cut = plain.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  const safe = lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut;
  return safe.trimEnd() + "…";
}

/**
 * Detect the « > **Error:** » preamble the transcription pipeline emits
 * on failure (network, missing transcript, model error). Used to switch
 * the card to its degraded UI instead of the regular summary panel.
 */
export function isTranscriptionErrorMarkdown(md: string | null): boolean {
  return !!md && md.startsWith("> **Error:**");
}

/** Compact view count for the meta-line (e.g. 12_540 → "12.5K"). */
export function formatViews(v: string | null): string {
  if (!v) return "";
  const n = parseInt(v, 10);
  if (isNaN(n)) return v;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

/** Human-readable HH MM SS duration (compact, e.g. "1h 23m 4s"). */
export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Shared style for the small gold « See more / See less » text-only
 *  toggle below the description and inside the audio player area. */
export const toggleLink: CSSProperties = {
  background: "none",
  border: "none",
  color: color.gold,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
  fontFamily: "inherit",
};
