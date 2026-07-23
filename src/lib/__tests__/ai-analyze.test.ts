import { describe, it, expect } from "vitest";
import { clampImportance } from "../ai-analyze";

describe("clampImportance", () => {
  it("keeps one-decimal precision (v2.19.x+)", () => {
    expect(clampImportance(8.4)).toBe(8.4);
    expect(clampImportance(9.75)).toBe(9.8);
    expect(clampImportance(7)).toBe(7);
  });

  it("clamps to the 1-10 range with the old integer-round tolerance", () => {
    expect(clampImportance(1)).toBe(1);
    expect(clampImportance(10)).toBe(10);
    // Slight overshoots clamp instead of dropping the score, matching
    // the previous integer Math.round behavior (10.4 → 10, 0.5 → 1).
    expect(clampImportance(10.2)).toBe(10);
    expect(clampImportance(10.4)).toBe(10);
    expect(clampImportance(0.5)).toBe(1);
    expect(clampImportance(0.9)).toBe(1);
    // Genuine garbage stays null.
    expect(clampImportance(0.4)).toBeNull();
    expect(clampImportance(10.5)).toBeNull();
    expect(clampImportance(47)).toBeNull();
    expect(clampImportance(-3)).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(clampImportance("8.4")).toBeNull();
    expect(clampImportance(undefined)).toBeNull();
    expect(clampImportance(null)).toBeNull();
    expect(clampImportance(Number.NaN)).toBeNull();
    expect(clampImportance(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
