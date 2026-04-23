"use client";

import type { Lang } from "@/lib/i18n";
import { getCookie } from "@/lib/cookies";
import { AudioPlayer } from "@/app/components/AudioPlayer";
import { TTS_VOICES_EN, TTS_VOICES_FR } from "@/app/components/VoiceAccordion";

/**
 * TTS player for the per-video SSR page (`/{topic}/v/{date}/{slug}`).
 *
 * Cousin of `DailySummaryAudio` but for video summaries: reads the
 * visitor's preferred speed + voice from cookies (with sensible
 * defaults), then renders the shared `AudioPlayer` client component.
 *
 * Same TTS text shape as the inline AudioPlayer in `VideoCard`:
 *  - intro: "Résumé de la vidéo {title}." / "Summary of the video {title}."
 *  - body: summary_md stripped of Markdown markup, capped at 4800 chars
 */

function readSpeed(): number {
  if (typeof document === "undefined") return 1.05;
  const raw = getCookie("ttsSpeed");
  if (raw && /^[\d.]+$/.test(raw)) return Math.min(1.2, Math.max(0.7, Number(raw)));
  return 1.05;
}

function readVoice(lang: Lang): string {
  if (typeof document === "undefined") return lang === "fr" ? "george" : "sarah";
  const raw = lang === "fr" ? getCookie("ttsVoiceFr") : getCookie("ttsVoice");
  const defaultV = lang === "fr" ? "george" : "sarah";
  const voices = lang === "fr" ? TTS_VOICES_FR : TTS_VOICES_EN;
  return raw && voices.some((v) => v.id === raw) ? raw : defaultV;
}

/**
 * Build the TTS text from a video summary. Strips Markdown markers
 * (headings, bold, bullets) and prepends a localized intro. Capped at
 * ~4800 chars to stay under ElevenLabs' single-shot generation limit.
 *
 * Exported for re-use by the future per-roundup page (Phase 2.4) which
 * needs the same logic.
 */
export function summaryMdToVideoTtsText(summaryMd: string, videoTitle: string, lang: Lang): string {
  const plain = summaryMd
    .replace(/^##\s+.+$/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  const intro =
    lang === "fr" ? `Résumé de la vidéo ${videoTitle}.` : `Summary of the video ${videoTitle}.`;
  const maxBody = 4800 - intro.length;
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
  const speed = readSpeed();
  const voice = readVoice(lang);
  const text = summaryMdToVideoTtsText(summaryMd, videoTitle, lang);

  if (!text) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <AudioPlayer text={text} lang={lang} speed={speed} voice={voice} />
    </div>
  );
}
