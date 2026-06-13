import { describe, expect, it } from "vitest";
import { normalizeHomeSurfaceQueueScore } from "@/lib/supabase/home-surface";

describe("normalizeHomeSurfaceQueueScore", () => {
  it("floors decimal video scores for the integer home queue threshold", () => {
    expect(normalizeHomeSurfaceQueueScore(9.4)).toBe(9);
    expect(normalizeHomeSurfaceQueueScore(9.9)).toBe(9);
    expect(normalizeHomeSurfaceQueueScore(10)).toBe(10);
  });

  it("clamps invalid or out-of-range values", () => {
    expect(normalizeHomeSurfaceQueueScore(-1)).toBe(0);
    expect(normalizeHomeSurfaceQueueScore(11)).toBe(10);
    expect(normalizeHomeSurfaceQueueScore(Number.NaN)).toBe(0);
  });
});
