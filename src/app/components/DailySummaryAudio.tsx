"use client";

import type { Lang } from "@/lib/i18n";
import { AudioPlayer } from "@/app/components/AudioPlayer";
import { TTS_TEXT_MAX_CHARS, ttsOutro, readTtsSpeed, readTtsVoice } from "@/lib/tts";

export function DailySummaryAudio({
  bullets,
  lang,
  topicName,
  date,
}: {
  bullets: Array<{ text: string }>;
  lang: Lang;
  topicName: string;
  date: string;
}) {
  const speed = readTtsSpeed();
  const voice = readTtsVoice(lang);

  if (bullets.length === 0) return null;

  const intro = lang === "fr"
    ? `Résumé quotidien topic ${topicName} du ${date}.`
    : `Daily topic summary for ${topicName}, ${date}.`;
  const outro = ttsOutro(lang);
  const body = bullets.map((b) => `• ${b.text}`).join(" ... ");
  const maxBody = TTS_TEXT_MAX_CHARS - intro.length - outro.length;
  const trimmed = body.length > maxBody ? body.slice(0, maxBody) + "…" : body;
  const ttsText = `${intro} ${trimmed} ${outro}`;

  return (
    <div style={{ marginBottom: 16 }}>
      <AudioPlayer text={ttsText} lang={lang} speed={speed} voice={voice} context="daily_summary" />
    </div>
  );
}
