import { describe, it, expect } from "vitest";
import { todayUtc, toUtcDateString, previousUtcDay } from "../dates-utc";

describe("todayUtc", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(todayUtc()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("toUtcDateString", () => {
  it("formats a Date in UTC", () => {
    expect(toUtcDateString(new Date("2026-06-11T23:59:59Z"))).toBe("2026-06-11");
  });

  it("formats an epoch-ms timestamp", () => {
    expect(toUtcDateString(Date.UTC(2026, 0, 1, 0, 0, 0))).toBe("2026-01-01");
  });

  it("uses the UTC day, not the local day", () => {
    // 2026-06-11T00:30Z is still June 10 in UTC-1 and westward.
    expect(toUtcDateString(new Date("2026-06-11T00:30:00Z"))).toBe("2026-06-11");
  });
});

describe("previousUtcDay", () => {
  it("walks back one calendar day", () => {
    expect(previousUtcDay("2026-06-11")).toBe("2026-06-10");
  });

  it("crosses month boundaries", () => {
    expect(previousUtcDay("2026-06-01")).toBe("2026-05-31");
  });

  it("crosses year boundaries", () => {
    expect(previousUtcDay("2026-01-01")).toBe("2025-12-31");
  });

  it("handles leap years", () => {
    expect(previousUtcDay("2024-03-01")).toBe("2024-02-29");
  });

  it("defaults to yesterday (relative to todayUtc)", () => {
    expect(previousUtcDay()).toBe(previousUtcDay(todayUtc()));
  });
});
