/**
 * Read-time normalization of video transcription summaries.
 *
 * Two concerns:
 * 1. The intro heading: older French summaries were generated with `## TL;DR`;
 *    we now display `## INTRO` instead.
 * 2. Bullet layout under `## Points clés` / `## Key Points`: legacy summaries
 *    use a single-line `- **Title**: paragraph` form, but the current style is
 *    a loose-list form with the bold title on its own line, a blank line, and
 *    the paragraph indented by two spaces underneath. We reformat at read time
 *    so existing rows in `video_transcriptions` do not need to be regenerated.
 */

function normalizeIntroHeading(summaryMd: string, lang: string): string {
  if (lang === "fr") {
    return summaryMd.replace(/^##\s+TL;DR\s*$/m, "## INTRO");
  }
  // For other languages keep the canonical `## TL;DR` heading even if the
  // stored summary happens to use the French label.
  return summaryMd.replace(/^##\s+INTRO\s*$/m, "## TL;DR");
}

/**
 * Convert legacy `- **Title**: paragraph` bullets into the loose-list form
 * `- **Title**\n\n  paragraph`. Only touches lines that look like the legacy
 * form so re-running the transformation is a no-op.
 */
function normalizeBulletLineBreaks(summaryMd: string): string {
  const lines = summaryMd.split("\n");
  const out: string[] = [];

  for (const line of lines) {
    // Match `- **Title** : rest` or `- **Title**: rest`. Title may contain
    // any non-`**` characters; rest is the remaining paragraph on the same
    // line. We allow leading whitespace and either `-` or `*` as bullet.
    const m = line.match(/^(\s*[-*]\s+)\*\*([^\n*]+?)\*\*\s*[:：]\s*(.+)$/);
    if (!m) {
      out.push(line);
      continue;
    }
    const [, bulletPrefix, title, rest] = m;
    const indent = " ".repeat(bulletPrefix.length);
    out.push(`${bulletPrefix}**${title.trim()}**`);
    out.push("");
    out.push(`${indent}${rest.trim()}`);
  }

  return out.join("\n");
}

export function normalizeSummaryHeadings(summaryMd: string, lang: string): string {
  if (!summaryMd) return summaryMd;
  return normalizeBulletLineBreaks(normalizeIntroHeading(summaryMd, lang));
}
