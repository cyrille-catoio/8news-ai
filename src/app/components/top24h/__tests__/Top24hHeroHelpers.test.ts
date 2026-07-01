import { describe, it, expect } from "vitest";
import {
  groupBullets,
  countGroups,
  type Bullet,
} from "../Top24hHeroHelpers";

function b(partial: Partial<Bullet> & { text: string }): Bullet {
  return { refs: [], ...partial };
}

describe("groupBullets", () => {
  it("folds consecutive same-title bullets into one group", () => {
    const groups = groupBullets([
      b({ text: "a1", title: "A" }),
      b({ text: "a2", title: "A" }),
      b({ text: "b1", title: "B" }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(["A", "B"]);
    expect(groups[0].bullets.map((x) => x.text)).toEqual(["a1", "a2"]);
  });

  it("gives untitled bullets their own empty-titled group", () => {
    const groups = groupBullets([
      b({ text: "x" }),
      b({ text: "y", title: "  " }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.title === "")).toBe(true);
  });

  it("does NOT merge non-consecutive same-title runs", () => {
    const groups = groupBullets([
      b({ text: "a1", title: "A" }),
      b({ text: "b1", title: "B" }),
      b({ text: "a2", title: "A" }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(["A", "B", "A"]);
  });

  it("sorts groups by importance DESC (first bullet of each group)", () => {
    const groups = groupBullets([
      b({ text: "low", title: "Low", importanceScore: 3 }),
      b({ text: "high", title: "High", importanceScore: 9 }),
      b({ text: "mid", title: "Mid", importanceScore: 6 }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(["High", "Mid", "Low"]);
  });

  it("interleaves video groups with article groups purely by score (no hoist)", () => {
    const groups = groupBullets([
      b({ text: "vid-low", title: "VideoLow", isVideo: true, importanceScore: 1 }),
      b({ text: "art-high", title: "ArticleHigh", importanceScore: 10 }),
      b({ text: "vid-high", title: "VideoHigh", isVideo: true, importanceScore: 9 }),
      b({ text: "art-mid", title: "ArticleMid", importanceScore: 5 }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(["ArticleHigh", "VideoHigh", "ArticleMid", "VideoLow"]);
  });

  it("treats missing scores as 0 (sink below scored groups), stable order", () => {
    const groups = groupBullets([
      b({ text: "n1", title: "NoScore1" }),
      b({ text: "s", title: "Scored", importanceScore: 5 }),
      b({ text: "n2", title: "NoScore2" }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(["Scored", "NoScore1", "NoScore2"]);
  });

  it("preserves bullet order WITHIN a group", () => {
    const groups = groupBullets([
      b({ text: "first", title: "T", importanceScore: 8 }),
      b({ text: "second", title: "T", importanceScore: 8 }),
    ]);
    expect(groups[0].bullets.map((x) => x.text)).toEqual(["first", "second"]);
  });
});

describe("countGroups", () => {
  it("matches groupBullets().length on mixed input", () => {
    const cases: Bullet[][] = [
      [],
      [b({ text: "x" })],
      [b({ text: "a1", title: "A" }), b({ text: "a2", title: "A" }), b({ text: "b", title: "B" })],
      [b({ text: "a", title: "A" }), b({ text: "x" }), b({ text: "a2", title: "A" })],
      [b({ text: "x" }), b({ text: "y" })],
    ];
    for (const bullets of cases) {
      expect(countGroups(bullets)).toBe(groupBullets(bullets).length);
    }
  });
});
