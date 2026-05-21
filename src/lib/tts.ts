import type { Lang } from "@/lib/i18n";

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
