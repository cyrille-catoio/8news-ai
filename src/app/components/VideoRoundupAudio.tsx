"use client";

import type { Lang } from "@/lib/i18n";
import { getCookie } from "@/lib/cookies";
import { AudioPlayer } from "@/app/components/AudioPlayer";
import { TTS_VOICES_EN, TTS_VOICES_FR } from "@/app/components/VoiceAccordion";

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

function roundupMdToTtsText(roundupMd: string, roundupTitle: string, topicName: string, date: string, lang: Lang): string {
  const plain = roundupMd
    .replace(/^#{2,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();
  const intro = lang === "fr"
    ? `Récap vidéo ${topicName} du ${date}. ${roundupTitle}.`
    : `Video recap for ${topicName}, ${date}. ${roundupTitle}.`;
  const outro = lang === "fr" ? "... ... Analyse terminée." : "... ... That's all folks!";
  const maxBody = 4800 - intro.length - outro.length;
  const body = plain.length > maxBody ? plain.slice(0, maxBody) + "..." : plain;
  return body.length > 0 ? `${intro} ${body} ${outro}` : "";
}

export function VideoRoundupAudio({
  introMd,
  roundupTitle,
  topicName,
  date,
  lang,
}: {
  introMd: string;
  roundupTitle: string;
  topicName: string;
  date: string;
  lang: Lang;
}) {
  const speed = readSpeed();
  const voice = readVoice(lang);
  const text = roundupMdToTtsText(introMd, roundupTitle, topicName, date, lang);

  if (!text) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <AudioPlayer text={text} lang={lang} speed={speed} voice={voice} />
    </div>
  );
}
