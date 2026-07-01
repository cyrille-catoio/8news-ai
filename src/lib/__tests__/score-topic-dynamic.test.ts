import { describe, it, expect } from "vitest";
import { parseScoreBatchResponse } from "../score-topic-dynamic";

describe("parseScoreBatchResponse", () => {
  it("parses a bare array response", () => {
    const raw = JSON.stringify([
      { index: 0, score: 8 },
      { index: 2, score: 3 },
    ]);
    const { results } = parseScoreBatchResponse(raw, 3);
    expect(results).toEqual([
      { index: 0, score: 8 },
      { index: 2, score: 3 },
    ]);
  });

  it("parses a single {index,score} object into a one-element result", () => {
    const { results } = parseScoreBatchResponse(JSON.stringify({ index: 1, score: 5 }), 3);
    expect(results).toEqual([{ index: 1, score: 5 }]);
  });

  it("parses an object that wraps the array under a key (e.g. scores)", () => {
    const raw = JSON.stringify({ scores: [{ index: 0, score: 9 }] });
    const { results } = parseScoreBatchResponse(raw, 3);
    expect(results).toEqual([{ index: 0, score: 9 }]);
  });

  it("drops entries whose index is out of the batch range", () => {
    const raw = JSON.stringify([
      { index: -1, score: 7 },
      { index: 3, score: 7 },
      { index: 1, score: 7 },
    ]);
    const { results } = parseScoreBatchResponse(raw, 3);
    expect(results).toEqual([{ index: 1, score: 7 }]);
  });

  it("drops entries with wrong-typed index or score", () => {
    const raw = JSON.stringify([
      { index: "0", score: 7 },
      { index: 1, score: "8" },
      { index: 2, score: 6 },
    ]);
    const { results } = parseScoreBatchResponse(raw, 3);
    expect(results).toEqual([{ index: 2, score: 6 }]);
  });

  it("returns empty results for malformed JSON or empty input", () => {
    expect(parseScoreBatchResponse("not json", 3).results).toEqual([]);
    expect(parseScoreBatchResponse(null, 3).results).toEqual([]);
    expect(parseScoreBatchResponse("", 3).results).toEqual([]);
  });

  it("omits debug unless collectDebug is set", () => {
    expect(parseScoreBatchResponse(JSON.stringify([{ index: 0, score: 8 }]), 3).debug).toBeUndefined();
  });

  it("emits debug metadata when collectDebug is true", () => {
    const raw = JSON.stringify({ scores: [{ index: 0, score: 8 }, { index: 9, score: 2 }] });
    const { debug } = parseScoreBatchResponse(raw, 3, true);
    expect(debug).toMatchObject({
      rawKeys: ["scores"],
      arrayLength: 2,
      filterPassed: 1, // index 9 is out of range → filtered out
    });
    expect(debug?.rawSample).toContain("scores");
  });

  it("reports the parse_error sample on malformed JSON with collectDebug", () => {
    expect(parseScoreBatchResponse("{bad", 3, true).debug).toEqual({ rawSample: "parse_error" });
  });
});
