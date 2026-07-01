import type { Lang } from "@/lib/i18n";
import { getCookie } from "@/lib/cookies";

/**
 * Maximum text length (chars) we send to /api/tts in one shot.
 *
 * History: this cap used to be 4 800 — a relic of ElevenLabs'
 * Multilingual v1 era when 5 000 was the single-request hard limit.
 * The current model (`eleven_flash_v2_5`, see /api/tts/route.ts)
 * accepts up to 40 000 chars per request, so the old cap was
 * truncating busy briefings mid-sentence with no functional reason —
 * the « podcast du jour » on busy days (8-12 thematic groups × 3
 * bullets × 3-5 sentences) routinely overflowed and the narration
 * ended on an abrupt "…" instead of the regular outro.
 *
 * The new value is sized for two real-world constraints:
 *  - Netlify synchronous functions time out at ~26 s; Flash v2.5
 *    generates at ~5x real-time, so 15 000 chars (~12-13 min of
 *    audio) stays comfortably under that window on the wire.
 *  - 8news briefings (Top 24h, daily summaries, video roundups)
 *    never exceed ~10 000 chars in practice — 15 000 gives a
 *    comfortable safety margin without nearing the timeout.
 *
 * Both the client-side audio components and the server route reuse
 * this single constant so an accidental client-side overflow is still
 * caught belt-and-braces by the server slice.
 */
export const TTS_TEXT_MAX_CHARS = 15000;

/**
 * Spoken outro appended to every TTS narration (Top 24h podcast, daily
 * summaries, video roundups, the SummaryBox archive view, etc.). The
 * leading « ... ... » seeds an ellipsis pause so the player breathes
 * before the final phrase instead of crashing it onto the body's last
 * word. Centralised here so the four call sites stay in sync — they
 * previously drifted (SummaryBox carried a slightly longer FR variant)
 * and the editorial tone was inconsistent across surfaces.
 */
export function ttsOutro(lang: Lang): string {
  return lang === "fr"
    ? "... ... C'est tout pour le moment. Vous pouvez retrouver une activité normale."
    : "... ... That's all, folks.";
}

/**
 * Selectable ElevenLabs voices per lang. Pure data (id → display label +
 * blurb + gender), lives here rather than in the `VoiceAccordion` client
 * component so both the accordion UI and the SSR-safe `readTtsVoice`
 * reader share one source (the accordion re-exports these for back-compat).
 */
export const TTS_VOICES_EN = [
  { id: "sarah",   label: "Jade",    desc: "American · Soft",          gender: "F" },
  { id: "alice",   label: "Alice",   desc: "British · Confident",      gender: "F" },
  { id: "rachel",  label: "Rachel",  desc: "American · Calm",          gender: "F" },
  { id: "daniel",  label: "Nicolas", desc: "British · News presenter", gender: "M" },
  { id: "drew",    label: "Drew",    desc: "American · News",          gender: "M" },
  { id: "josh",    label: "Josh",    desc: "American · Deep",          gender: "M" },
] as const;

export const TTS_VOICES_FR = [
  { id: "george",    label: "Tristan",   desc: "Chaleureux · Posé",     gender: "M" },
  { id: "charlotte", label: "Charlotte", desc: "Chaleureuse · Douce",   gender: "F" },
  { id: "lily",      label: "Lily",      desc: "Posée · Naturelle",     gender: "F" },
  { id: "nicole",    label: "Nicole",    desc: "Intime · Calme",        gender: "F" },
  { id: "thomas",    label: "Thomas",    desc: "Calme · Narrateur",     gender: "M" },
  { id: "callum",    label: "Callum",    desc: "Intense · Dynamique",   gender: "M" },
] as const;

/**
 * Read the persisted TTS playback speed from the `ttsSpeed` cookie,
 * clamped to the ElevenLabs-supported [0.7, 1.2] band. SSR-safe: returns
 * the 1.05 default when there is no `document`. Shared by every audio
 * surface (Top 24h, daily summary, video roundup, video page).
 */
export function readTtsSpeed(): number {
  if (typeof document === "undefined") return 1.05;
  const raw = getCookie("ttsSpeed");
  if (raw && /^[\d.]+$/.test(raw)) return Math.min(1.2, Math.max(0.7, Number(raw)));
  return 1.05;
}

/**
 * Read the persisted per-lang TTS voice id from the `ttsVoice`/`ttsVoiceFr`
 * cookie, falling back to the lang default when unset or unknown. SSR-safe.
 */
export function readTtsVoice(lang: Lang): string {
  if (typeof document === "undefined") return lang === "fr" ? "george" : "sarah";
  const raw = lang === "fr" ? getCookie("ttsVoiceFr") : getCookie("ttsVoice");
  const defaultV = lang === "fr" ? "george" : "sarah";
  const voices = lang === "fr" ? TTS_VOICES_FR : TTS_VOICES_EN;
  return raw && voices.some((v) => v.id === raw) ? raw : defaultV;
}
