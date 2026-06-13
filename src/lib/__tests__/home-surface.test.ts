import { describe, expect, it } from "vitest";
import { normalizeHomeSurfaceQueueScore } from "@/lib/supabase/home-surface";

describe("normalizeHomeSurfaceQueueScore", () => {
  it("preserves one-decimal video scores for the home queue", () => {
    expect(normalizeHomeSurfaceQueueScore(9.44)).toBe(9.4);
    expect(normalizeHomeSurfaceQueueScore(9.46)).toBe(9.5);
    expect(normalizeHomeSurfaceQueueScore(10)).toBe(10);
  });

  it("rejects invalid or out-of-range values", () => {
    expect(normalizeHomeSurfaceQueueScore(-1)).toBeNull();
    expect(normalizeHomeSurfaceQueueScore(11)).toBeNull();
    expect(normalizeHomeSurfaceQueueScore(Number.NaN)).toBeNull();
  });
});
