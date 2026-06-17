import { describe, expect, it } from "vitest";
import { parseGlobalAvgScoreAgg } from "../supabase/stats";

describe("parseGlobalAvgScoreAgg", () => {
  it("reads a numeric average from the PostgREST aggregate row", () => {
    expect(parseGlobalAvgScoreAgg([{ avg_score: 6.42 }])).toBe(6.42);
  });

  it("accepts Postgres numeric values returned as strings", () => {
    expect(parseGlobalAvgScoreAgg([{ avg_score: "6.42" }])).toBe(6.42);
  });

  it("falls back to zero for empty or malformed aggregate payloads", () => {
    expect(parseGlobalAvgScoreAgg([])).toBe(0);
    expect(parseGlobalAvgScoreAgg([{ avg_score: null }])).toBe(0);
    expect(parseGlobalAvgScoreAgg([{ avg_score: "not-a-number" }])).toBe(0);
  });
});
