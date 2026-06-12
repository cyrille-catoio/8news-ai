import { describe, expect, it } from "vitest";
import { selectTopicStrips } from "../select-topic-strips";
import type { MiniArticle } from "../YourTopicsSection";

function art(link: string, score: number | null = 7, pubDate = "2026-06-12T10:00:00Z"): MiniArticle {
  return { title: link, link, source: "src", pubDate, score };
}

describe("selectTopicStrips", () => {
  it("keeps the user's preferred order and caps at maxStrips", () => {
    const strips = selectTopicStrips({
      preferredIds: ["a", "b", "c", "d", "e"],
      articlesByTopic: {
        a: [art("a1")], b: [art("b1")], c: [art("c1")], d: [art("d1")], e: [art("e1")],
      },
    });
    expect(Object.keys(strips)).toEqual(["a", "b", "c", "d"]);
  });

  it("skips empty preferred topics and promotes later preferred ones", () => {
    const strips = selectTopicStrips({
      preferredIds: ["a", "b", "c", "d", "e", "f"],
      articlesByTopic: {
        a: [art("a1")], b: [], c: [art("c1")], d: [], e: [art("e1")], f: [art("f1")],
      },
    });
    expect(Object.keys(strips)).toEqual(["a", "c", "e", "f"]);
  });

  it("fills remaining slots with non-preferred topics ranked by best score", () => {
    const strips = selectTopicStrips({
      preferredIds: ["a", "b"],
      fillIds: ["x", "y", "z"],
      articlesByTopic: {
        a: [art("a1")], b: [art("b1")],
        x: [art("x1", 6)], y: [art("y1", 9)], z: [art("z1", 8)],
      },
    });
    expect(Object.keys(strips)).toEqual(["a", "b", "y", "z"]);
  });

  it("breaks fill-rank ties by most recent top article", () => {
    const strips = selectTopicStrips({
      preferredIds: ["a", "b", "c"],
      fillIds: ["old", "fresh"],
      articlesByTopic: {
        a: [art("a1")], b: [art("b1")], c: [art("c1")],
        old: [art("o1", 8, "2026-06-12T01:00:00Z")],
        fresh: [art("f1", 8, "2026-06-12T11:00:00Z")],
      },
    });
    expect(Object.keys(strips)).toEqual(["a", "b", "c", "fresh"]);
  });

  it("dedups by link with first-selected-wins, and hides topics emptied by dedup", () => {
    const shared = art("shared");
    const strips = selectTopicStrips({
      preferredIds: ["a", "b", "c"],
      articlesByTopic: {
        a: [shared, art("a2")],
        b: [shared],
        c: [art("c1")],
      },
    });
    expect(strips.a.map((x) => x.link)).toEqual(["shared", "a2"]);
    expect(strips.b).toBeUndefined();
    expect(Object.keys(strips)).toEqual(["a", "c"]);
  });

  it("does not claim links truncated out of a strip, leaving them for later topics", () => {
    const extra = art("extra");
    const strips = selectTopicStrips({
      preferredIds: ["a", "b"],
      articlesByTopic: {
        a: [art("a1"), art("a2"), art("a3"), extra],
        b: [extra],
      },
      perStrip: 3,
    });
    expect(strips.a).toHaveLength(3);
    expect(strips.b.map((x) => x.link)).toEqual(["extra"]);
  });

  it("caps each strip at perStrip articles", () => {
    const strips = selectTopicStrips({
      preferredIds: ["a"],
      articlesByTopic: { a: [art("a1"), art("a2"), art("a3"), art("a4")] },
    });
    expect(strips.a).toHaveLength(3);
  });

  it("ignores fill ids that duplicate preferred ids and unknown topics", () => {
    const strips = selectTopicStrips({
      preferredIds: ["a"],
      fillIds: ["a", "ghost"],
      articlesByTopic: { a: [art("a1")] },
    });
    expect(Object.keys(strips)).toEqual(["a"]);
  });

  it("returns an empty record when nothing has articles", () => {
    const strips = selectTopicStrips({
      preferredIds: ["a", "b"],
      fillIds: ["x"],
      articlesByTopic: { a: [], b: [], x: [] },
    });
    expect(Object.keys(strips)).toEqual([]);
  });
});
