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
  const speed = readSpeed();
  const voice = readVoice(lang);

  if (bullets.length === 0) return null;

  const intro = lang === "fr"
    ? `Résumé quotidien ${topicName} du ${date}.`
    : `Daily summary for ${topicName}, ${date}.`;
  const outro = lang === "fr"
    ? "... ... Analyse terminée."
    : "... ... That's all folks!";
  const body = bullets.map((b) => `• ${b.text}`).join(" ... ");
  const maxBody = 4800 - intro.length - outro.length;
  const trimmed = body.length > maxBody ? body.slice(0, maxBody) + "…" : body;
  const ttsText = `${intro} ${trimmed} ${outro}`;

  return (
    <div style={{ marginBottom: 16 }}>
      <AudioPlayer text={ttsText} lang={lang} speed={speed} voice={voice} />
    </div>
  );
}
