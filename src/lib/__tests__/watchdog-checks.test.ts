import { describe, it, expect } from "vitest";
import {
  evaluateWatchdog,
  type WatchdogSnapshot,
  FETCH_STALE_MINUTES,
  SCORE_BACKLOG_FLOOR,
  TRANSCRIBE_STALE_HOURS,
} from "@/lib/watchdog-checks";

/** 2026-06-12 at the given UTC hour. */
function utc(hour: number, minute = 0): number {
  return Date.UTC(2026, 5, 12, hour, minute, 0);
}

function healthy(nowMs: number): WatchdogSnapshot {
  return {
    nowMs,
    todayUtc: "2026-06-12",
    podcastLangs: ["en", "fr"],
    lastFetchedAtMs: nowMs - 10 * 60_000,
    lastScoredAtMs: nowMs - 10 * 60_000,
    staleBacklogCount: 0,
    lastTranscriptionMs: nowMs - 2 * 3_600_000,
  };
}

describe("evaluateWatchdog", () => {
  it("returns no problems when everything is fresh", () => {
    expect(evaluateWatchdog(healthy(utc(8)))).toEqual([]);
  });

  describe("podcast snapshot", () => {
    it("flags each missing lang after the grace hour", () => {
      const problems = evaluateWatchdog({
        ...healthy(utc(8)),
        podcastLangs: [],
      });
      expect(problems).toHaveLength(2);
      expect(problems[0]).toContain("lang=en");
      expect(problems[1]).toContain("lang=fr");
    });

    it("flags a single missing lang (the EN-stuck-on-yesterday incident)", () => {
      const problems = evaluateWatchdog({
        ...healthy(utc(8)),
        podcastLangs: ["fr"],
      });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("lang=en");
      expect(problems[0]).toContain("2026-06-12");
    });

    it("stays silent before the grace hour (cron may not have run yet)", () => {
      const problems = evaluateWatchdog({
        ...healthy(utc(3, 59)),
        podcastLangs: [],
      });
      expect(problems).toEqual([]);
    });
  });

  describe("fetch pipeline", () => {
    it("flags a stale last_fetched_at", () => {
      const now = utc(8);
      const problems = evaluateWatchdog({
        ...healthy(now),
        lastFetchedAtMs: now - (FETCH_STALE_MINUTES + 5) * 60_000,
      });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("fetch");
    });

    it("flags a null last_fetched_at as 'jamais'", () => {
      const problems = evaluateWatchdog({
        ...healthy(utc(8)),
        lastFetchedAtMs: null,
      });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("jamais");
    });

    it("tolerates an age just under the threshold", () => {
      const now = utc(8);
      const problems = evaluateWatchdog({
        ...healthy(now),
        lastFetchedAtMs: now - (FETCH_STALE_MINUTES - 1) * 60_000,
      });
      expect(problems).toEqual([]);
    });
  });

  describe("scoring pipeline", () => {
    it("needs BOTH a high stale backlog and a stale scoring stamp", () => {
      const now = utc(8);
      const highBacklogOnly = evaluateWatchdog({
        ...healthy(now),
        staleBacklogCount: SCORE_BACKLOG_FLOOR + 1,
      });
      expect(highBacklogOnly).toEqual([]);

      const staleStampOnly = evaluateWatchdog({
        ...healthy(now),
        lastScoredAtMs: now - 3_600_000,
      });
      expect(staleStampOnly).toEqual([]);

      const both = evaluateWatchdog({
        ...healthy(now),
        staleBacklogCount: SCORE_BACKLOG_FLOOR + 1,
        lastScoredAtMs: now - 3_600_000,
      });
      expect(both).toHaveLength(1);
      expect(both[0]).toContain("scoring");
    });
  });

  describe("video transcription", () => {
    it("flags when no transcription landed within the window", () => {
      const now = utc(8);
      const problems = evaluateWatchdog({
        ...healthy(now),
        lastTranscriptionMs: now - (TRANSCRIBE_STALE_HOURS + 1) * 3_600_000,
      });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("transcription");
    });
  });

  it("accumulates multiple problems in one run", () => {
    const now = utc(8);
    const problems = evaluateWatchdog({
      nowMs: now,
      todayUtc: "2026-06-12",
      podcastLangs: [],
      lastFetchedAtMs: null,
      lastScoredAtMs: null,
      staleBacklogCount: SCORE_BACKLOG_FLOOR + 100,
      lastTranscriptionMs: null,
    });
    expect(problems).toHaveLength(5); // 2 podcast langs + fetch + scoring + transcribe
  });
});
