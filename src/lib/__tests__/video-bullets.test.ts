import { describe, it, expect } from "vitest";
import { extractBulletsFromMarkdown, buildVideoBulletRows } from "../video-bullets";
import { todayUtc } from "../dates-utc";

const SUMMARY_EN = [
  "## TL;DR",
  "One factual sentence.",
  "",
  "## Key points",
  "- **First point** with detail",
  "  continued on the next line",
  "- **Second point** standalone",
  "- Third point without bold",
  "",
  "## CONCLUSION",
  "- Not a bullet — section already closed.",
].join("\n");

describe("extractBulletsFromMarkdown", () => {
  it("parses the KEY POINTS block into one string per bullet", () => {
    const bullets = extractBulletsFromMarkdown(SUMMARY_EN);
    expect(bullets).toEqual([
      "**First point** with detail continued on the next line",
      "**Second point** standalone",
      "Third point without bold",
    ]);
  });

  it("matches the FR heading « Points clés »", () => {
    const md = "## Points clés\n- premier\n- deuxième\n";
    expect(extractBulletsFromMarkdown(md)).toEqual(["premier", "deuxième"]);
  });

  it("stops at the next ## heading", () => {
    const bullets = extractBulletsFromMarkdown(SUMMARY_EN);
    expect(bullets.some((b) => b.includes("section already closed"))).toBe(false);
  });

  it("returns [] when there is no key-points section", () => {
    expect(extractBulletsFromMarkdown("## TL;DR\njust an intro")).toEqual([]);
    expect(extractBulletsFromMarkdown("")).toEqual([]);
  });

  it("supports * list markers", () => {
    const md = "## Key points\n* one\n* two";
    expect(extractBulletsFromMarkdown(md)).toEqual(["one", "two"]);
  });
});

const BASE_INPUT = {
  transcriptionId: 42,
  topicId: "ai" as string | null,
  lang: "en" as const,
  videoId: "abc123",
  videoTitle: "  My Video  ",
  channelTitle: "My Channel",
  publishedDate: "2026-06-10",
  summaryMd: SUMMARY_EN,
};

describe("buildVideoBulletRows", () => {
  it("builds one row per bullet with stable indexes and stripped bold", () => {
    const rows = buildVideoBulletRows(BASE_INPUT);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.bullet_index)).toEqual([0, 1, 2]);
    expect(rows[0].text).toBe("First point with detail continued on the next line");
    expect(rows.every((r) => r.source_type === "video")).toBe(true);
    expect(rows.every((r) => r.video_transcription_id === 42)).toBe(true);
  });

  it("uses published_date as summary_date", () => {
    const rows = buildVideoBulletRows(BASE_INPUT);
    expect(rows[0].summary_date).toBe("2026-06-10");
  });

  it("falls back to today UTC when publishedDate is missing", () => {
    const rows = buildVideoBulletRows({ ...BASE_INPUT, publishedDate: null });
    expect(rows[0].summary_date).toBe(todayUtc());
  });

  it("carries exactly one ref pointing at the YouTube video", () => {
    const rows = buildVideoBulletRows(BASE_INPUT);
    expect(rows[0].refs).toEqual([
      { title: "My Video", link: "https://www.youtube.com/watch?v=abc123", source: "My Channel" },
    ]);
  });

  it("defaults ref title/source when empty", () => {
    const rows = buildVideoBulletRows({ ...BASE_INPUT, videoTitle: " ", channelTitle: null });
    expect(rows[0].refs[0].title).toBe("Untitled");
    expect(rows[0].refs[0].source).toBe("YouTube");
  });

  it("returns [] when the summary has no bullets", () => {
    expect(buildVideoBulletRows({ ...BASE_INPUT, summaryMd: "## TL;DR\nnothing" })).toEqual([]);
  });
});
