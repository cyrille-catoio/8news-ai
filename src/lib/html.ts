const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&apos;": "'", "&nbsp;": " ",
};

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (match) => HTML_ENTITIES[match] ?? match);
}

/**
 * Strip emoji codepoints from a string. Covers pictographs, modifiers,
 * regional indicators (flags), zero-width joiners, and variation selectors.
 * Collapses any whitespace runs introduced by the removal and trims edges.
 *
 * Used to clean YouTube video titles before display in lists where they
 * would compete with our own iconography (e.g. score badges).
 */
const EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200D\uFE0F]/gu;
export function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, "").replace(/\s+/g, " ").trim();
}
