import { describe, it, expect } from "vitest";
import { extractVideoBulletText, stripMarkdownInline } from "../generate-top-summary";

describe("stripMarkdownInline", () => {
  it("strips bold and italic markers", () => {
    expect(stripMarkdownInline("**bold** and *italic*")).toBe("bold and italic");
  });

  it("strips heading hashes and list bullets", () => {
    expect(stripMarkdownInline("## Heading\n- item one\n* item two")).toBe(
      "Heading item one item two",
    );
  });

  it("collapses whitespace", () => {
    expect(stripMarkdownInline("  a\n\n  b   c ")).toBe("a b c");
  });
});

const SUMMARY = [
  "## TL;DR",
  "OpenAI announced **GPT-5** with new agentic benchmarks.",
  "",
  "## KEY POINTS",
  "- **Benchmarks** beat the previous frontier on SWE-bench.",
  "  Additional detail line under the same bullet.",
  "- **Pricing** unchanged at launch.",
  "",
  "## CONCLUSION",
  "Wrap-up sentence.",
].join("\n");

describe("extractVideoBulletText", () => {
  it("takes the TL;DR and appends the first key point when it fits", () => {
    const text = extractVideoBulletText(SUMMARY);
    expect(text).toBe(
      "OpenAI announced GPT-5 with new agentic benchmarks. " +
        "Benchmarks beat the previous frontier on SWE-bench. Additional detail line under the same bullet.",
    );
  });

  it("matches the FR INTRO / POINTS CLÉS headings", () => {
    const fr = "## INTRO\nUne phrase factuelle.\n\n## POINTS CLÉS\n- **Premier** point.\n- Deuxième.";
    expect(extractVideoBulletText(fr)).toBe("Une phrase factuelle. Premier point.");
  });

  it("unwraps a fenced code block around the whole summary", () => {
    const fenced = "```markdown\n" + SUMMARY + "\n```";
    expect(extractVideoBulletText(fenced)).toBe(extractVideoBulletText(SUMMARY));
  });

  it("falls back to the first non-heading paragraph when no TL;DR", () => {
    const md = "# Title\n\nFirst real paragraph here.\n\nSecond paragraph.";
    expect(extractVideoBulletText(md)).toBe("First real paragraph here.");
  });

  it("skips the key point when appending would exceed maxChars", () => {
    const text = extractVideoBulletText(SUMMARY, 60);
    expect(text).toBe("OpenAI announced GPT-5 with new agentic benchmarks.");
  });

  it("truncates on a word boundary with an ellipsis", () => {
    const md = "## TL;DR\n" + "word ".repeat(50);
    const text = extractVideoBulletText(md, 40);
    expect(text.length).toBeLessThanOrEqual(41);
    expect(text.endsWith("…")).toBe(true);
    expect(text).not.toContain("  ");
  });

  it("returns empty string for empty input", () => {
    expect(extractVideoBulletText("")).toBe("");
    expect(extractVideoBulletText("   ")).toBe("");
  });
});
