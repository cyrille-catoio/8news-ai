import { describe, it, expect } from "vitest";
import {
  buildReaderPages,
  clampPageIndex,
  readerCounterLabel,
} from "../PodcastReaderHelpers";
import type { Bullet } from "../Top24hHeroHelpers";

function b(partial: Partial<Bullet> & { text: string }): Bullet {
  return { refs: [], ...partial };
}

describe("buildReaderPages", () => {
  it("returns [] when there are no bullets (reader should not open)", () => {
    expect(buildReaderPages([])).toEqual([]);
  });

  it("maps one page per group — the first slide IS the first news", () => {
    const pages = buildReaderPages([
      b({ text: "a1", title: "A" }),
      b({ text: "b1", title: "B" }),
    ]);
    expect(pages).toHaveLength(2);
    expect(pages[0].group.title).toBe("A");
  });

  it("numbers pages 1-based with the shared total", () => {
    const pages = buildReaderPages([
      b({ text: "a1", title: "A" }),
      b({ text: "a2", title: "A" }),
      b({ text: "b1", title: "B" }),
    ]);
    expect(pages.map((p) => p.index)).toEqual([1, 2]);
    expect(pages.every((p) => p.total === 2)).toBe(true);
  });

  it("keeps the importance-DESC ordering of groupBullets", () => {
    const pages = buildReaderPages([
      b({ text: "low", title: "Low", importanceScore: 3 }),
      b({ text: "high", title: "High", importanceScore: 9 }),
    ]);
    expect(pages.map((p) => p.group.title)).toEqual(["High", "Low"]);
  });

  it("folds consecutive same-title bullets into a single page", () => {
    const pages = buildReaderPages([
      b({ text: "a1", title: "A" }),
      b({ text: "a2", title: "A" }),
    ]);
    expect(pages).toHaveLength(1);
    expect(pages[0].group.bullets.map((x) => x.text)).toEqual(["a1", "a2"]);
  });
});

describe("clampPageIndex", () => {
  it("clamps below 0 to 0", () => {
    expect(clampPageIndex(-1, 5)).toBe(0);
    expect(clampPageIndex(-10, 5)).toBe(0);
  });

  it("clamps above total-1 to total-1", () => {
    expect(clampPageIndex(5, 5)).toBe(4);
    expect(clampPageIndex(99, 5)).toBe(4);
  });

  it("passes through in-range indexes", () => {
    expect(clampPageIndex(0, 5)).toBe(0);
    expect(clampPageIndex(3, 5)).toBe(3);
    expect(clampPageIndex(4, 5)).toBe(4);
  });

  it("collapses to 0 when total is 0 or negative", () => {
    expect(clampPageIndex(3, 0)).toBe(0);
    expect(clampPageIndex(3, -2)).toBe(0);
  });
});

describe("readerCounterLabel", () => {
  it("renders « i / N »", () => {
    expect(readerCounterLabel(3, 8)).toBe("3 / 8");
    expect(readerCounterLabel(1, 1)).toBe("1 / 1");
  });
});
