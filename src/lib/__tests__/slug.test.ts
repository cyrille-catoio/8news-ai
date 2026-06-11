import { describe, it, expect } from "vitest";
import { slugifyVideoTitle, uniquifyVideoSlug } from "../slug";

describe("slugifyVideoTitle", () => {
  it("keeps the first 5 keyword tokens in order (stop words and short tokens dropped)", () => {
    expect(
      slugifyVideoTitle("Anthropic launches Claude 4 with new agentic benchmarks today", "en"),
    ).toBe("anthropic-launches-claude-new-agentic");
  });

  it("strips diacritics", () => {
    expect(slugifyVideoTitle("Résumé complet des annonces", "fr")).toBe(
      "resume-complet-annonces",
    );
  });

  it("drops stop words per language", () => {
    expect(slugifyVideoTitle("The future of the AI podcast", "en")).toBe("future");
    expect(slugifyVideoTitle("Le futur de la crypto en France", "fr")).toBe(
      "futur-crypto-france",
    );
  });

  it("drops tokens shorter than 3 chars", () => {
    expect(slugifyVideoTitle("AI vs ML on GPU farms", "en")).toBe("gpu-farms");
  });

  it("returns empty string for empty / all-stop-word titles", () => {
    expect(slugifyVideoTitle("", "en")).toBe("");
    expect(slugifyVideoTitle("the of and", "en")).toBe("");
  });

  it("caps at 60 chars on a token boundary", () => {
    const slug = slugifyVideoTitle(
      "extraordinarily comprehensive investigation regarding superintelligence preparedness",
      "en",
    );
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});

/** Minimal Supabase mock returning fixed rows for the bucket query. */
function mockDb(rows: Array<{ slug_keywords: string; video_id: string }>, error: unknown = null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    like: () => Promise.resolve({ data: rows, error }),
  };
  return { from: () => chain };
}

describe("uniquifyVideoSlug", () => {
  it("returns the base slug when the bucket is empty", async () => {
    const slug = await uniquifyVideoSlug(mockDb([]), "claude-4", "ai", "2026-06-11", "en", "vid1");
    expect(slug).toBe("claude-4");
  });

  it("is idempotent for the video that already owns a slug", async () => {
    const db = mockDb([{ slug_keywords: "claude-4-2", video_id: "vid1" }]);
    const slug = await uniquifyVideoSlug(db, "claude-4", "ai", "2026-06-11", "en", "vid1");
    expect(slug).toBe("claude-4-2");
  });

  it("walks -2, -3… until a free slot", async () => {
    const db = mockDb([
      { slug_keywords: "claude-4", video_id: "other1" },
      { slug_keywords: "claude-4-2", video_id: "other2" },
    ]);
    const slug = await uniquifyVideoSlug(db, "claude-4", "ai", "2026-06-11", "en", "vid1");
    expect(slug).toBe("claude-4-3");
  });

  it("returns the base slug on query error", async () => {
    const db = mockDb([], new Error("boom"));
    const slug = await uniquifyVideoSlug(db, "claude-4", "ai", "2026-06-11", "en", "vid1");
    expect(slug).toBe("claude-4");
  });

  it("passes through an empty base slug", async () => {
    const slug = await uniquifyVideoSlug(mockDb([]), "", "ai", "2026-06-11", "en", "vid1");
    expect(slug).toBe("");
  });
});
