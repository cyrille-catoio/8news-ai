import { describe, it, expect } from "vitest";
import {
  extractVideoBulletText,
  stripMarkdownInline,
  selectTopArticleBullets,
  parseTopSummaryLangsParam,
} from "../generate-top-summary";

describe("parseTopSummaryLangsParam", () => {
  it("defaults to both langs when the param is absent or empty", () => {
    expect(parseTopSummaryLangsParam(null)).toEqual(["en", "fr"]);
    expect(parseTopSummaryLangsParam(undefined)).toEqual(["en", "fr"]);
    expect(parseTopSummaryLangsParam("")).toEqual(["en", "fr"]);
  });

  it("selects a single lang (the watchdog self-heal case)", () => {
    expect(parseTopSummaryLangsParam("en")).toEqual(["en"]);
    expect(parseTopSummaryLangsParam("fr")).toEqual(["fr"]);
  });

  it("accepts a comma-separated list, trims, lowercases and dedups", () => {
    expect(parseTopSummaryLangsParam("en,fr")).toEqual(["en", "fr"]);
    expect(parseTopSummaryLangsParam(" FR , en , fr ")).toEqual(["fr", "en"]);
  });

  it("falls back to both langs on garbage input", () => {
    expect(parseTopSummaryLangsParam("de,es")).toEqual(["en", "fr"]);
    expect(parseTopSummaryLangsParam(",,,")).toEqual(["en", "fr"]);
  });
});

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

type B = { id: string; title: string | null; importance: number | null };
const mk = (id: string, title: string | null, importance: number | null): B => ({
  id,
  title,
  importance,
});

describe("selectTopArticleBullets", () => {
  it("returns everything untouched when under budget", () => {
    const bullets = [mk("a", "A", 9), mk("b", "B", 3)];
    expect(selectTopArticleBullets(bullets, 6)).toEqual(bullets);
  });

  it("keeps the most important groups when over budget", () => {
    const bullets = [
      mk("low", "Low", 2),
      mk("high", "High", 9),
      mk("mid", "Mid", 6),
    ];
    expect(selectTopArticleBullets(bullets, 2).map((b) => b.id)).toEqual(["high", "mid"]);
  });

  it("keeps a multi-bullet group together, in narrative order", () => {
    const bullets = [
      mk("n1", "Nvidia", 9),
      mk("n2", "Nvidia", 9),
      mk("solo", "Solo", 5),
    ];
    expect(selectTopArticleBullets(bullets, 3).map((b) => b.id)).toEqual(["n1", "n2", "solo"]);
  });

  it("truncates inside the group straddling the budget boundary", () => {
    const bullets = [
      mk("n1", "Nvidia", 9),
      mk("n2", "Nvidia", 9),
      mk("n3", "Nvidia", 9),
      mk("solo", "Solo", 8),
    ];
    expect(selectTopArticleBullets(bullets, 2).map((b) => b.id)).toEqual(["n1", "n2"]);
  });

  it("treats missing importance as 0 and keeps stable order on ties", () => {
    const bullets = [
      mk("u1", "Untitled1", null),
      mk("s", "Scored", 5),
      mk("u2", "Untitled2", null),
    ];
    expect(selectTopArticleBullets(bullets, 2).map((b) => b.id)).toEqual(["s", "u1"]);
  });

  it("does not merge non-consecutive same-title runs", () => {
    const bullets = [
      mk("a1", "A", 4),
      mk("b", "B", 9),
      mk("a2", "A", 4),
    ];
    expect(selectTopArticleBullets(bullets, 2).map((b) => b.id)).toEqual(["b", "a1"]);
  });

  it("returns [] on zero or negative budget", () => {
    expect(selectTopArticleBullets([mk("a", "A", 9)], 0)).toEqual([]);
  });
});
