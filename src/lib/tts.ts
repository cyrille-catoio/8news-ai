import type { Lang } from "@/lib/i18n";

/**
 * Maximum text length (chars) we send to /api/tts in one shot.
 *
 * The current ElevenLabs model accepts larger single requests than the old
 * Multilingual v1 API, but this route still waits synchronously for the full
 * MP3 before responding. Keep the prompt near the previously proven ceiling so
 * busy briefings truncate gracefully instead of timing out the serverless
 * function and returning no audio at all.
 *
 * Both the client-side audio components and the server route reuse
 * this single constant so an accidental client-side overflow is still
 * caught belt-and-braces by the server slice.
 */
export const TTS_TEXT_MAX_CHARS = 4800;

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
