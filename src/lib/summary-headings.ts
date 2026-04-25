/**
 * Read-time normalization of video transcription summaries.
 *
 * Four concerns:
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
 * 4. Key-point bullet titles are then promoted to `### Title` headings (with
 *    the body paragraph un-indented to a regular `<p>`) so renderers can
 *    style them in gold via `h3` — same visual treatment as the roundup
 *    pages. Idempotent: re-running on already-promoted markdown is a no-op.
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

/**
 * Promote bullet titles under `## Points clés` / `## Key Points` to `###`
 * headings so renderers can style them in gold (matches the roundup
 * pages' `### Title` + paragraph layout).
 *
 * Input  (loose-list form, produced upstream by `normalizeBulletLineBreaks`):
 *   - **Title**
 *
 *     Paragraph indented by two spaces.
 *
 * Output:
 *   ### Title
 *
 *   Paragraph (un-indented).
 *
 * Conservative — only fires inside the Key Points section, only on
 * bullets whose entire inline content is a single `**…**` bold span,
 * and only un-indents the 2-space-indented body that immediately
 * follows. Anything that doesn't match the exact pattern is passed
 * through untouched, so re-running on already-promoted markdown
 * (or on summaries with no bullets) is a no-op.
 */
function promoteBulletTitlesToHeadings(summaryMd: string): string {
  const lines = summaryMd.split("\n");
  const out: string[] = [];
  let inKeyPoints = false;
  let stripIndent = false;

  for (const line of lines) {
    if (/^##\s+(?:Points?\s+cl|Key\s+Points)/i.test(line)) {
      inKeyPoints = true;
      stripIndent = false;
      out.push(line);
      continue;
    }
    if (inKeyPoints && /^##\s/.test(line)) {
      inKeyPoints = false;
      stripIndent = false;
      out.push(line);
      continue;
    }
    if (!inKeyPoints) {
      out.push(line);
      continue;
    }

    // Bullet whose only inline content is a `**Title**` bold span.
    // Tolerates leading whitespace and either `-` or `*` markers.
    const titleMatch = line.match(/^\s*[-*]\s+\*\*([^*\n]+?)\*\*\s*$/);
    if (titleMatch) {
      out.push(`### ${titleMatch[1].trim()}`);
      stripIndent = true;
      continue;
    }

    // Body paragraph that follows: un-indent the 2 spaces meant to
    // keep it inside the legacy bullet so it renders as a plain <p>
    // under the new <h3>.
    if (stripIndent && /^  \S/.test(line)) {
      out.push(line.slice(2));
      continue;
    }

    if (line.trim() === "") {
      out.push(line);
      continue;
    }

    // Any other content (next bullet, sub-list, raw paragraph) ends
    // the strip-indent window for the current title.
    stripIndent = false;
    out.push(line);
  }

  return out.join("\n");
}

export function normalizeSummaryHeadings(summaryMd: string, lang: string): string {
  if (!summaryMd) return summaryMd;
  // Order matters: strip the wrapping ```markdown fence FIRST so the
  // intro-heading replace and the bullet-line-break reflow see plain
  // Markdown. Then reflow legacy single-line bullets into the loose
  // form so `promoteBulletTitlesToHeadings` finds a uniform input.
  return promoteBulletTitlesToHeadings(
    normalizeBulletLineBreaks(
      normalizeIntroHeading(stripCodeFences(summaryMd), lang),
    ),
  );
}
