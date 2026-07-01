import { describe, it, expect } from "vitest";
import { parseVideoScoreResponse } from "../score-video-summary-batch";

const rows = [{ id: 100 }, { id: 200 }, { id: 300 }];

describe("parseVideoScoreResponse", () => {
  it("maps index → row id and passes valid integer scores through", () => {
    const raw = JSON.stringify({ scores: [{ index: 0, score: 7 }, { index: 2, score: 4 }] });
    expect(parseVideoScoreResponse(raw, rows)).toEqual([
      { id: 100, score: 7 },
      { id: 300, score: 4 },
    ]);
  });

  it("clamps scores into the 1-10 band", () => {
    const raw = JSON.stringify({ scores: [{ index: 0, score: 0 }, { index: 1, score: 42 }] });
    expect(parseVideoScoreResponse(raw, rows)).toEqual([
      { id: 100, score: 1 },
      { id: 200, score: 10 },
    ]);
  });

  it("keeps one decimal only in the 9-10 band, integers below 9", () => {
    const raw = JSON.stringify({
      scores: [
        { index: 0, score: 9.4 }, // in band → 9.4
        { index: 1, score: 8.6 }, // below 9 → rounds to 9
        { index: 2, score: 8.4 }, // below 9 → rounds to 8
      ],
    });
    expect(parseVideoScoreResponse(raw, rows)).toEqual([
      { id: 100, score: 9.4 },
      { id: 200, score: 9 },
      { id: 300, score: 8 },
    ]);
  });

  it("drops entries whose index has no matching row", () => {
    const raw = JSON.stringify({ scores: [{ index: 9, score: 7 }] });
    expect(parseVideoScoreResponse(raw, rows)).toEqual([]);
  });

  it("drops entries with wrong-typed index or score", () => {
    const raw = JSON.stringify({
      scores: [
        { index: "0", score: 7 },
        { index: 1, score: "8" },
        { index: 2, score: 6 },
      ],
    });
    expect(parseVideoScoreResponse(raw, rows)).toEqual([{ id: 300, score: 6 }]);
  });

  it("returns [] for malformed JSON, missing scores, or empty input", () => {
    expect(parseVideoScoreResponse("not json", rows)).toEqual([]);
    expect(parseVideoScoreResponse(JSON.stringify({}), rows)).toEqual([]);
    expect(parseVideoScoreResponse("", rows)).toEqual([]);
    expect(parseVideoScoreResponse(null, rows)).toEqual([]);
    expect(parseVideoScoreResponse(undefined, rows)).toEqual([]);
  });
});
