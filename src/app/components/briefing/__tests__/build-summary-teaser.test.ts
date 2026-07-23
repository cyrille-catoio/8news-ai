import { describe, it, expect } from "vitest";
import { buildTeaserBullets, type DailySummaryBullet } from "../utils";

const bullet = (text: string): DailySummaryBullet => ({ text });

describe("buildTeaserBullets", () => {
  it("returns the first two trimmed bullet texts", () => {
    const bullets = ["  One.  ", "Two.", "Three."].map(bullet);
    expect(buildTeaserBullets(bullets, "")).toEqual(["One.", "Two."]);
  });

  it("returns a single bullet when only one is available", () => {
    expect(buildTeaserBullets([bullet("Only one.")], "")).toEqual(["Only one."]);
  });

  it("skips blank or malformed bullets", () => {
    const bullets: DailySummaryBullet[] = [
      { text: "   " },
      { text: "Kept." },
      { title: "no text" } as unknown as DailySummaryBullet,
      { text: "Also kept." },
      { text: "Dropped (third)." },
    ];
    expect(buildTeaserBullets(bullets, "")).toEqual(["Kept.", "Also kept."]);
  });

  it("falls back to the trimmed seo_description when bullets are missing", () => {
    expect(buildTeaserBullets([], "  Legacy description.  ")).toEqual(["Legacy description."]);
    expect(buildTeaserBullets([{ text: "   " }], "fallback")).toEqual(["fallback"]);
  });

  it("returns an empty array when there is nothing to show", () => {
    expect(buildTeaserBullets([], "   ")).toEqual([]);
  });
});
