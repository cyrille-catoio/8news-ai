/**
 * Read-time normalization of video transcription summaries.
 *
 * Three concerns:
 * 1. Some completions arrive wrapped in a fenced code block (```markdown\n…\n```)
 *    because GPT sometimes "frames" long Markdown responses. ReactMarkdown
 *    then renders the whole block as a `<pre><code>` (monospace, no
 *    word-wrap), which makes the summary look like raw MD. Strip these
 *    fences first so every other normalization (and the renderer) sees
 *    plain Markdown.
 * 2. The intro heading: older French summaries were generated with `## TL;DR`;
 *    we now display `## INTRO` instead.
 * 3. Bullet layout under `## Points clés` / `## Key Points`: legacy summaries
 *    use a single-line `- **Title**: paragraph` form, but the current style is
 *    a loose-list form with the bold title on its own line, a blank line, and
 *    the paragraph indented by two spaces underneath. We reformat at read time
 *    so existing rows in `video_transcriptions` do not need to be regenerated.
 */

/**
 * Remove a single fenced code block that wraps the whole response, e.g.
 *   ```markdown
 *   ## INTRO
 *   …
 *   ```
 * Conservative: only strips when both opening and closing fences are present
 * at the very start/end of the trimmed string. Internal fenced code blocks
 * inside a longer summary are kept intact.
 */
function stripCodeFences(md: string): string {
  if (!md) return md;
  const trimmed = md.trim();
  const m = trimmed.match(/^```[A-Za-z0-9_-]*\s*\n([\s\S]*?)\n```$/);
  return m ? m[1] : md;
}

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
  // Order matters: strip the wrapping ```markdown fence FIRST, so the intro-
  // heading replace and the bullet-line-break reflow see plain Markdown.
  return normalizeBulletLineBreaks(
    normalizeIntroHeading(stripCodeFences(summaryMd), lang),
  );
}
