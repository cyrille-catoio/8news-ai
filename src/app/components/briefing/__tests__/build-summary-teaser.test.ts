import { describe, it, expect } from "vitest";
import { buildSummaryTeaser, type DailySummaryBullet } from "../utils";

const bullet = (text: string): DailySummaryBullet => ({ text });

describe("buildSummaryTeaser", () => {
  it("falls back to the trimmed seo_description when bullets are missing", () => {
    expect(buildSummaryTeaser([], "  Legacy description.  ")).toBe("Legacy description.");
    expect(buildSummaryTeaser([{ text: "   " }], "fallback")).toBe("fallback");
  });

  it("joins up to 6 bullets with spaces", () => {
    const bullets = ["One.", "Two.", "Three.", "Four.", "Five.", "Six.", "Seven."].map(bullet);
    expect(buildSummaryTeaser(bullets, "")).toBe("One. Two. Three. Four. Five. Six.");
  });

  it("returns the joined text untouched when it fits the 840-char budget", () => {
    const text = "x".repeat(400);
    expect(buildSummaryTeaser([bullet(text), bullet(text)], "")).toBe(`${text} ${text}`);
  });

  it("caps at 840 chars on a word boundary with an ellipsis", () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const out = buildSummaryTeaser([bullet(words)], "");
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(841);
    // Word-boundary cut: no partial word right before the ellipsis.
    const body = out.slice(0, -1).trimEnd();
    expect(words.startsWith(body)).toBe(true);
    expect(words[body.length]).toBe(" ");
  });

  it("hard-cuts mid-word when the last space would discard too much", () => {
    const oneGiantWord = "y".repeat(2000);
    const out = buildSummaryTeaser([bullet(oneGiantWord)], "");
    expect(out).toBe("y".repeat(840) + "…");
  });
});
