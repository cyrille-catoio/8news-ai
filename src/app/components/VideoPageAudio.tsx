"use client";

import type { Lang } from "@/lib/i18n";
import { AudioPlayer } from "@/app/components/AudioPlayer";
import { TTS_TEXT_MAX_CHARS, readTtsSpeed, readTtsVoice } from "@/lib/tts";

/**
 * TTS player for the per-video SSR page (`/{topic}/v/{date}/{slug}`).
 *
 * Cousin of `DailySummaryAudio` but for video summaries: reads the
 * visitor's preferred speed + voice from cookies (with sensible
 * defaults), then renders the shared `AudioPlayer` client component.
 *
 * Same TTS text shape as the inline AudioPlayer in `VideoCard`:
 *  - intro: "Résumé de la vidéo {title}." / "Summary of the video {title}."
 *  - body: summary_md stripped of Markdown markup, capped at
 *    `TTS_TEXT_MAX_CHARS` (see `src/lib/tts.ts`) to stay under the
 *    serverless function timeout — well above Flash v2.5's own
 *    40 000-char request ceiling.
 */

/**
 * Build the TTS text from a video summary. Strips Markdown markers
 * (headings, bold, bullets) and prepends a localized intro. Capped at
 * `TTS_TEXT_MAX_CHARS` — see `src/lib/tts.ts` for the rationale (the
 * previous ~4800 hard ceiling was a vestige of the older Multilingual
 * v1 model and was truncating long summaries with no functional reason).
 *
 * Exported for re-use by the future per-roundup page (Phase 2.4) which
 * needs the same logic.
 */
export function summaryMdToVideoTtsText(summaryMd: string, videoTitle: string, lang: Lang): string {
  const plain = summaryMd
    // h2 lines (## INTRO, ## Key Points) are section markers — drop the
    // whole line so TTS doesn't speak the navigation labels.
    .replace(/^##\s+.+$/gm, "")
    // h3 lines (### Title) are per-key-point titles promoted from
    // `- **Title**` bullets — keep the title text inline by stripping
    // only the `### ` prefix (NOT the line) so TTS speaks it as part
    // of the body.
    .replace(/^###\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  const intro =
    lang === "fr" ? `Résumé de la vidéo ${videoTitle}.` : `Summary of the video ${videoTitle}.`;
  const maxBody = TTS_TEXT_MAX_CHARS - intro.length;
  const body = plain.length > maxBody ? plain.slice(0, maxBody) + "…" : plain;
  return body.length > 0 ? `${intro} ${body}` : "";
}

export function VideoPageAudio({
  summaryMd,
  videoTitle,
  lang,
}: {
  summaryMd: string;
  videoTitle: string;
  lang: Lang;
}) {
  const speed = readTtsSpeed();
  const voice = readTtsVoice(lang);
  const text = summaryMdToVideoTtsText(summaryMd, videoTitle, lang);

  if (!text) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <AudioPlayer text={text} lang={lang} speed={speed} voice={voice} context="video_page" />
    </div>
  );
}
