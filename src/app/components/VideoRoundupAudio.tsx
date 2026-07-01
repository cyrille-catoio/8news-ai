"use client";

import type { Lang } from "@/lib/i18n";
import { AudioPlayer } from "@/app/components/AudioPlayer";
import { TTS_TEXT_MAX_CHARS, ttsOutro, readTtsSpeed, readTtsVoice } from "@/lib/tts";

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
  const outro = ttsOutro(lang);
  const maxBody = TTS_TEXT_MAX_CHARS - intro.length - outro.length;
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
  const speed = readTtsSpeed();
  const voice = readTtsVoice(lang);
  const text = roundupMdToTtsText(introMd, roundupTitle, topicName, date, lang);

  if (!text) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <AudioPlayer text={text} lang={lang} speed={speed} voice={voice} context="video_roundup" />
    </div>
  );
}
