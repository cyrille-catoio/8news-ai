/**
 * Transcript providers sometimes append caption-credit fragments to the raw
 * text. If they survive into the model prompt, GPT can copy them into the
 * final article as nonsense such as "Sous-titrage ST' 501".
 *
 * Keep this deliberately narrow: remove known subtitle-credit boilerplate,
 * not arbitrary non-English words or proper nouns.
 */
export function stripSubtitleCreditArtifacts(text: string): string {
  if (!text) return text;
  return text
    .replace(/\s*\bSous[-\s]?titrage\s+ST[’']?\s*\d+\b\.?/giu, "")
    .replace(/\s*\bSous[-\s]?titres?\s+ST[’']?\s*\d+\b\.?/giu, "")
    .replace(/\s*\bSubtitles?\s+ST[’']?\s*\d+\b\.?/giu, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .trim();
}
