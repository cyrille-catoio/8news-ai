import { describe, expect, it } from "vitest";
import {
  SHORTS_SEEN_MAX,
  SHORTS_WINDOW_DAYS,
  buildShortsEmbedUrl,
  clampShortsIndex,
  formatShortDuration,
  isShortDuration,
  parseSeenIds,
  selectUnseenShorts,
  serializeSeen,
  shortsCounterLabel,
  shortsDayKey,
  shortsDayLabel,
  shortsWindowStartIso,
} from "../ShortsHelpers";

describe("isShortDuration", () => {
  it("accepts durations strictly under 180s", () => {
    expect(isShortDuration(59)).toBe(true);
    expect(isShortDuration(179)).toBe(true);
  });

  it("rejects 180s and longer", () => {
    expect(isShortDuration(180)).toBe(false);
    expect(isShortDuration(3600)).toBe(false);
  });

  it("rejects unknown or zero durations (unknown is not a Short)", () => {
    expect(isShortDuration(null)).toBe(false);
    expect(isShortDuration(undefined)).toBe(false);
    expect(isShortDuration(0)).toBe(false);
  });
});

describe("shortsWindowStartIso", () => {
  it("returns local midnight days-1 days ago", () => {
    const now = new Date(2026, 6, 22, 15, 30); // local July 22, 15:30
    const iso = shortsWindowStartIso(now, 5);
    expect(new Date(iso).getTime()).toBe(new Date(2026, 6, 18, 0, 0, 0, 0).getTime());
  });

  it("spans month boundaries", () => {
    const now = new Date(2026, 7, 2, 8, 0); // local Aug 2
    const iso = shortsWindowStartIso(now, 5);
    expect(new Date(iso).getTime()).toBe(new Date(2026, 6, 29, 0, 0, 0, 0).getTime());
  });

  it("clamps a non-positive window to a single day", () => {
    const now = new Date(2026, 6, 22, 15, 30);
    expect(shortsWindowStartIso(now, 0)).toBe(shortsWindowStartIso(now, 1));
  });

  it("defaults to the 5-day product window", () => {
    const now = new Date(2026, 6, 22, 9, 0);
    expect(shortsWindowStartIso(now)).toBe(shortsWindowStartIso(now, SHORTS_WINDOW_DAYS));
  });
});

describe("shortsDayLabel", () => {
  const now = new Date(2026, 6, 22, 15, 0); // local July 22

  it("labels the current local day as today (EN + FR)", () => {
    const published = new Date(2026, 6, 22, 1, 30).toISOString();
    expect(shortsDayLabel(published, now, "en")).toBe("Today");
    expect(shortsDayLabel(published, now, "fr")).toBe("Aujourd'hui");
  });

  it("labels the previous local day as yesterday (EN + FR)", () => {
    const published = new Date(2026, 6, 21, 23, 45).toISOString();
    expect(shortsDayLabel(published, now, "en")).toBe("Yesterday");
    expect(shortsDayLabel(published, now, "fr")).toBe("Hier");
  });

  it("falls back to a localized short date beyond yesterday", () => {
    const published = new Date(2026, 6, 18, 12, 0).toISOString();
    expect(shortsDayLabel(published, now, "en")).toBe("July 18");
    expect(shortsDayLabel(published, now, "fr")).toBe("18 juillet");
  });

  it("returns an empty label on an unparseable date", () => {
    expect(shortsDayLabel("not-a-date", now, "en")).toBe("");
  });
});

describe("buildShortsEmbedUrl", () => {
  it("builds a muted autoplay looping embed with the JS API enabled", () => {
    const url = buildShortsEmbedUrl("abc123", { isLocal: false, origin: "https://8news.ai" });
    expect(url.startsWith("https://www.youtube.com/embed/abc123?")).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get("autoplay")).toBe("1");
    expect(params.get("mute")).toBe("1");
    expect(params.get("playsinline")).toBe("1");
    expect(params.get("controls")).toBe("0");
    expect(params.get("loop")).toBe("1");
    expect(params.get("playlist")).toBe("abc123");
    expect(params.get("enablejsapi")).toBe("1");
    expect(params.get("origin")).toBe("https://8news.ai");
  });

  it("uses the nocookie host and skips origin on localhost", () => {
    const url = buildShortsEmbedUrl("abc123", { isLocal: true, origin: "http://127.0.0.1:3000" });
    expect(url.startsWith("https://www.youtube-nocookie.com/embed/abc123?")).toBe(true);
    expect(new URL(url).searchParams.get("origin")).toBeNull();
  });

  it("URL-encodes the video id in the path", () => {
    const url = buildShortsEmbedUrl("a/b", { isLocal: true });
    expect(url).toContain("/embed/a%2Fb?");
  });
});

describe("clampShortsIndex", () => {
  it("clamps into [0, total)", () => {
    expect(clampShortsIndex(-1, 5)).toBe(0);
    expect(clampShortsIndex(0, 5)).toBe(0);
    expect(clampShortsIndex(4, 5)).toBe(4);
    expect(clampShortsIndex(5, 5)).toBe(4);
  });

  it("pins to 0 on an empty feed", () => {
    expect(clampShortsIndex(3, 0)).toBe(0);
  });
});

describe("shortsCounterLabel", () => {
  it("formats position / total", () => {
    expect(shortsCounterLabel(3, 42)).toBe("3 / 42");
  });
});

describe("formatShortDuration", () => {
  it("formats M:SS with zero-padded seconds", () => {
    expect(formatShortDuration(45)).toBe("0:45");
    expect(formatShortDuration(60)).toBe("1:00");
    expect(formatShortDuration(179)).toBe("2:59");
  });

  it("floors fractional and negative inputs", () => {
    expect(formatShortDuration(61.9)).toBe("1:01");
    expect(formatShortDuration(-3)).toBe("0:00");
  });
});

describe("shortsDayKey", () => {
  it("formats the local calendar day as YYYY-MM-DD", () => {
    expect(shortsDayKey(new Date(2026, 6, 23, 15, 30))).toBe("2026-07-23");
    expect(shortsDayKey(new Date(2026, 0, 5, 0, 0))).toBe("2026-01-05");
    expect(shortsDayKey(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
});

describe("parseSeenIds / serializeSeen", () => {
  const today = "2026-07-23";

  it("round-trips a growing set for today", () => {
    let raw = serializeSeen(new Set(), "A", today);
    expect([...parseSeenIds(raw, today)]).toEqual(["A"]);
    raw = serializeSeen(parseSeenIds(raw, today), "B", today);
    raw = serializeSeen(parseSeenIds(raw, today), "C", today);
    expect([...parseSeenIds(raw, today)]).toEqual(["A", "B", "C"]);
  });

  it("is idempotent — re-adding a seen id keeps order and count", () => {
    const raw = serializeSeen(new Set(["A", "B"]), "A", today);
    expect([...parseSeenIds(raw, today)]).toEqual(["A", "B"]);
  });

  it("ignores a set saved on a different day", () => {
    const raw = serializeSeen(new Set(["A", "B"]), "C", "2026-07-22");
    expect(parseSeenIds(raw, today).size).toBe(0);
  });

  it("returns an empty set for absent, empty or malformed storage", () => {
    expect(parseSeenIds(null, today).size).toBe(0);
    expect(parseSeenIds("", today).size).toBe(0);
    expect(parseSeenIds("not json", today).size).toBe(0);
    expect(parseSeenIds("{}", today).size).toBe(0);
    expect(parseSeenIds(JSON.stringify({ date: today }), today).size).toBe(0);
    expect(parseSeenIds(JSON.stringify({ date: today, ids: "nope" }), today).size).toBe(0);
  });

  it("drops non-string ids defensively", () => {
    const raw = JSON.stringify({ date: today, ids: ["A", 42, "", "B", null] });
    expect([...parseSeenIds(raw, today)]).toEqual(["A", "B"]);
  });

  it("caps the stored set to the most recent SHORTS_SEEN_MAX ids", () => {
    const big = new Set(Array.from({ length: SHORTS_SEEN_MAX }, (_, i) => `id${i}`));
    const raw = serializeSeen(big, "newest", today);
    const parsed = parseSeenIds(raw, today);
    expect(parsed.size).toBe(SHORTS_SEEN_MAX);
    expect(parsed.has("newest")).toBe(true);
    expect(parsed.has("id0")).toBe(false); // oldest dropped
    expect(parsed.has("id1")).toBe(true);
  });
});

describe("selectUnseenShorts", () => {
  const feed = ["X", "Y", "Z", "A", "B", "Q", "R"].map((videoId) => ({ videoId }));

  it("keeps only unseen Shorts, preserving newest-first order", () => {
    const seen = new Set(["A", "B"]);
    expect(selectUnseenShorts(feed, seen).map((v) => v.videoId)).toEqual([
      "X", "Y", "Z", "Q", "R",
    ]);
  });

  it("surfaces newly-arrived Shorts first, then older unseen ones", () => {
    // Session 1 saw the then-top ["A","B"]; new Shorts X,Y,Z arrived on top.
    const seen = new Set(["A", "B"]);
    const result = selectUnseenShorts(feed, seen).map((v) => v.videoId);
    expect(result[0]).toBe("X"); // newest new arrival, not missed
    expect(result).not.toContain("A"); // already seen, skipped
    expect(result).toContain("Q"); // older unseen still reachable
  });

  it("returns the full list when everything has been seen (caught up)", () => {
    const seen = new Set(feed.map((v) => v.videoId));
    expect(selectUnseenShorts(feed, seen)).toEqual(feed);
  });

  it("returns everything when nothing has been seen (first open)", () => {
    expect(selectUnseenShorts(feed, new Set()).map((v) => v.videoId)).toEqual(
      feed.map((v) => v.videoId),
    );
  });

  it("handles an empty feed", () => {
    expect(selectUnseenShorts([], new Set(["A"]))).toEqual([]);
  });
});
