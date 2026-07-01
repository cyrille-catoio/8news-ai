import { describe, it, expect } from "vitest";
import { normalizeVideoScore, formatScore } from "../score-format";

describe("normalizeVideoScore", () => {
  it("accepts an in-range number and keeps one decimal", () => {
    expect(normalizeVideoScore(8)).toBe(8);
    expect(normalizeVideoScore(9.4)).toBe(9.4);
  });

  it("accepts a numeric string (PostgREST NUMERIC can come back as text)", () => {
    expect(normalizeVideoScore("7")).toBe(7);
    expect(normalizeVideoScore("9.7")).toBe(9.7);
  });

  it("rounds defensively to one decimal", () => {
    expect(normalizeVideoScore(9.44)).toBe(9.4);
    expect(normalizeVideoScore(9.46)).toBe(9.5);
  });

  it("keeps the inclusive 1 and 10 boundaries", () => {
    expect(normalizeVideoScore(1)).toBe(1);
    expect(normalizeVideoScore(10)).toBe(10);
  });

  it("rejects out-of-range values", () => {
    expect(normalizeVideoScore(0)).toBeNull();
    expect(normalizeVideoScore(0.9)).toBeNull();
    expect(normalizeVideoScore(10.1)).toBeNull();
    expect(normalizeVideoScore(-3)).toBeNull();
  });

  it("rejects non-numeric / nullish / NaN inputs", () => {
    expect(normalizeVideoScore(null)).toBeNull();
    expect(normalizeVideoScore(undefined)).toBeNull();
    expect(normalizeVideoScore("abc")).toBeNull();
    expect(normalizeVideoScore("")).toBeNull();
    expect(normalizeVideoScore({})).toBeNull();
    expect(normalizeVideoScore(NaN)).toBeNull();
  });
});

describe("formatScore", () => {
  it("renders integers without a decimal", () => {
    expect(formatScore(8)).toBe("8");
    expect(formatScore(10)).toBe("10");
    expect(formatScore(9.0)).toBe("9");
  });

  it("renders fractional scores with exactly one decimal", () => {
    expect(formatScore(9.1)).toBe("9.1");
    expect(formatScore(9.7)).toBe("9.7");
  });
});
