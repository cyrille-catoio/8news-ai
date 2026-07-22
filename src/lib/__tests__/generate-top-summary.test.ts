import { describe, it, expect } from "vitest";
import {
  extractVideoBulletText,
  stripMarkdownInline,
  selectTopArticleBullets,
  parseTopSummaryLangsParam,
  generateTopSummaryPrompt,
  buildBulletTranslationPayload,
  applyBulletTranslations,
  renderBulletsMarkdown,
} from "../generate-top-summary";
import type { SummaryBullet } from "../types";

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

  it("maximizes distinct subjects: one bullet per group before second angles", () => {
    // 2-bullet Nvidia group + 2 solo groups, budget 2 → two DISTINCT
    // subjects (Nvidia's top angle + the next group), NOT both Nvidia
    // angles which would render as a single subject.
    const bullets = [
      mk("n1", "Nvidia", 9),
      mk("n2", "Nvidia", 9),
      mk("solo", "Solo", 5),
    ];
    expect(selectTopArticleBullets(bullets, 2).map((b) => b.id)).toEqual(["n1", "solo"]);
  });

  it("backfills extra angles only when there are fewer groups than the budget", () => {
    // Thin day: a single 3-bullet group, budget 2 → no other subject to
    // reach for, so the second angle backfills the slot.
    const bullets = [
      mk("n1", "Nvidia", 9),
      mk("n2", "Nvidia", 9),
      mk("n3", "Nvidia", 9),
      mk("solo", "Solo", 8),
    ];
    expect(selectTopArticleBullets(bullets, 3).map((b) => b.id)).toEqual([
      "n1",
      "n2",
      "solo",
    ]);
  });

  it("keeps each group's bullets consecutive and in narrative order when backfilling", () => {
    const bullets = [
      mk("a1", "A", 9),
      mk("a2", "A", 9),
      mk("b1", "B", 5),
      mk("b2", "B", 5),
    ];
    // budget 3, 2 groups: 1 per group (a1, b1) then backfill the top
    // group's second angle — a2 stays adjacent to a1.
    expect(selectTopArticleBullets(bullets, 3).map((b) => b.id)).toEqual(["a1", "a2", "b1"]);
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

describe("generateTopSummaryPrompt", () => {
  it("no longer asks for the unused `relevant` array (pure token waste)", () => {
    expect(generateTopSummaryPrompt("en")).not.toContain('"relevant"');
    expect(generateTopSummaryPrompt("fr")).not.toContain('"relevant"');
  });

  it("still asks for the grouped globalSummary schema with importance", () => {
    for (const lang of ["en", "fr"] as const) {
      const p = generateTopSummaryPrompt(lang);
      expect(p).toContain('"globalSummary"');
      expect(p).toContain('"importance"');
    }
  });
});

const REF = { title: "Ref", link: "https://x.test/a", source: "Src" };
const sb = (
  text: string,
  title: string | null,
  importance: number | null = null,
): SummaryBullet => ({ text, title, importance, refs: [REF] });

describe("buildBulletTranslationPayload", () => {
  it("collects unique titles in first-appearance order and one text per bullet", () => {
    const bullets = [
      sb("a1", "Nvidia"),
      sb("a2", "Nvidia"),
      sb("b", "OpenAI"),
      sb("c", null),
    ];
    expect(buildBulletTranslationPayload(bullets)).toEqual({
      titles: ["Nvidia", "OpenAI"],
      texts: ["a1", "a2", "b", "c"],
    });
  });
});

describe("applyBulletTranslations", () => {
  const bullets = [sb("a1", "Nvidia", 9), sb("a2", "Nvidia", 9), sb("b", "OpenAI", 7)];

  it("swaps titles and texts while preserving refs and importance", () => {
    const out = applyBulletTranslations(bullets, {
      titles: ["Nvidia FR", "OpenAI FR"],
      texts: ["a1 fr", "a2 fr", "b fr"],
    });
    expect(out).not.toBeNull();
    expect(out!.map((b) => b.text)).toEqual(["a1 fr", "a2 fr", "b fr"]);
    // Same-title runs stay identical so the UI folding is preserved.
    expect(out!.map((b) => b.title)).toEqual(["Nvidia FR", "Nvidia FR", "OpenAI FR"]);
    expect(out!.map((b) => b.importance)).toEqual([9, 9, 7]);
    expect(out!.every((b) => b.refs[0].link === REF.link)).toBe(true);
  });

  it("keeps untitled bullets untitled", () => {
    const out = applyBulletTranslations([sb("x", null)], { titles: [], texts: ["x fr"] });
    expect(out).not.toBeNull();
    expect(out![0].title).toBeNull();
  });

  it("rejects length mismatches (caller falls back to native generation)", () => {
    expect(
      applyBulletTranslations(bullets, { titles: ["only one"], texts: ["a", "b", "c"] }),
    ).toBeNull();
    expect(
      applyBulletTranslations(bullets, { titles: ["T1", "T2"], texts: ["a", "b"] }),
    ).toBeNull();
  });

  it("rejects missing arrays and empty strings", () => {
    expect(applyBulletTranslations(bullets, {})).toBeNull();
    expect(
      applyBulletTranslations(bullets, { titles: ["T1", "T2"], texts: ["a", "", "c"] }),
    ).toBeNull();
    expect(
      applyBulletTranslations(bullets, { titles: ["T1", "  "], texts: ["a", "b", "c"] }),
    ).toBeNull();
  });
});

describe("renderBulletsMarkdown", () => {
  it("prints each group title once in bold, then its bullets", () => {
    const md = renderBulletsMarkdown([
      sb("a1", "Nvidia"),
      sb("a2", "Nvidia"),
      sb("b", "OpenAI"),
    ]);
    expect(md).toBe("**Nvidia**\n• a1\n• a2\n\n**OpenAI**\n• b");
  });

  it("renders untitled bullets without a heading", () => {
    expect(renderBulletsMarkdown([sb("solo", null)])).toBe("• solo");
  });
});
