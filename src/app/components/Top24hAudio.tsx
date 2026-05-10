"use client";

import { dateLocale, type Lang } from "@/lib/i18n";
import { getCookie } from "@/lib/cookies";
import { AudioPlayer } from "@/app/components/AudioPlayer";
import { TTS_VOICES_EN, TTS_VOICES_FR } from "@/app/components/VoiceAccordion";

/**
 * TTS audio player for the cross-topic Top 24h editorial brief
 * (`Top24hHero` accordion). v2.6.12+ — same UX register as
 * `DailySummaryAudio` and `VideoRoundupAudio`: a single inline ribbon
 * that wraps the shared `<AudioPlayer>` (ElevenLabs) with the user's
 * persisted speed / voice cookie preferences.
 *
 * Composing the spoken text
 * -------------------------
 * The Top 24h flat bullet list carries an optional `title` per bullet
 * — consecutive same-title rows belong to the same thematic group
 * (the accordion folds them visually). For TTS we mirror that:
 * each group header is announced once, then its bullets follow,
 * separated by `« ... »` ellipsis pauses so the player breathes
 * between paragraphs. Empty-titled bullets keep their bare body.
 *
 * Length cap
 * ----------
 * `AudioPlayer` enforces a ~4800 char limit (ElevenLabs request size).
 * We compute the intro + outro length and clamp the body to fit. The
 * Top 24h body is typically 6-12 groups × 1-3 bullets × 3-5 sentences
 * — usually under 5000 chars, but a busy day can spill, hence the
 * defensive cut.
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

export function Top24hAudio({
  bullets,
  lang,
  date,
}: {
  bullets: Array<{ text: string; title?: string | null }>;
  lang: Lang;
  /** YYYY-MM-DD — the snapshot's `summary_date`. Used in the spoken intro. */
  date: string;
}) {
  const speed = readSpeed();
  const voice = readVoice(lang);

  if (bullets.length === 0) return null;

  // Group consecutive same-title bullets back into thematic groups so
  // the TTS announces each group title once before its paragraphs —
  // mirrors the visual fold in `groupBullets` (Top24hHero.tsx). An
  // empty title means « no group header », bullet body alone.
  const groups: Array<{ title: string; bullets: string[] }> = [];
  for (const b of bullets) {
    const t = (b.title ?? "").trim();
    const last = groups[groups.length - 1];
    if (last && last.title === t) last.bullets.push(b.text);
    else groups.push({ title: t, bullets: [b.text] });
  }

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString(
    dateLocale(lang),
    { day: "numeric", month: "long", year: "numeric" },
  );

  const intro =
    lang === "fr"
      ? `Top articles 24 heures du ${dateLabel}.`
      : `Top 24-hour articles for ${dateLabel}.`;
  const outro =
    lang === "fr" ? "... ... Analyse terminée." : "... ... That's all folks!";

  const body = groups
    .map((g) => {
      const header = g.title ? `${g.title}.` : "";
      const bul = g.bullets.map((t) => `• ${t}`).join(" ... ");
      return header ? `${header} ${bul}` : bul;
    })
    .join(" ... ... ");

  const maxBody = 4800 - intro.length - outro.length;
  const trimmed = body.length > maxBody ? body.slice(0, maxBody) + "…" : body;
  const ttsText = `${intro} ${trimmed} ${outro}`;

  return (
    <div style={{ marginBottom: 16 }}>
      <AudioPlayer text={ttsText} lang={lang} speed={speed} voice={voice} />
    </div>
  );
}
