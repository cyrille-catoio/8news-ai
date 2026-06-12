import { describe, it, expect } from "vitest";
import { groupArticlesByTopic } from "../topic-strips";
import type { TopicStripRow } from "../supabase/articles";

function row(over: Partial<TopicStripRow> = {}): TopicStripRow {
  return {
    topic: "ai",
    title: "Raw title",
    title_ai_en: "AI title EN",
    title_ai_fr: "Titre IA FR",
    link: "https://example.com/a",
    source: "Example",
    pub_date: "2026-06-12T08:00:00Z",
    relevance_score: 8,
    ...over,
  };
}

describe("groupArticlesByTopic", () => {
  it("groups rows per topic preserving the incoming (score-sorted) order", () => {
    const rows = [
      row({ topic: "ai", link: "a1", relevance_score: 9 }),
      row({ topic: "crypto", link: "c1", relevance_score: 8 }),
      row({ topic: "ai", link: "a2", relevance_score: 7 }),
    ];
    const out = groupArticlesByTopic(rows, 3, "en");
    expect(Object.keys(out)).toEqual(["ai", "crypto"]);
    expect(out.ai.map((a) => a.link)).toEqual(["a1", "a2"]);
    expect(out.crypto.map((a) => a.link)).toEqual(["c1"]);
  });

  it("caps each topic at perTopic without dropping later topics", () => {
    const rows = [
      row({ topic: "ai", link: "a1" }),
      row({ topic: "ai", link: "a2" }),
      row({ topic: "ai", link: "a3" }),
      row({ topic: "crypto", link: "c1" }),
    ];
    const out = groupArticlesByTopic(rows, 2, "en");
    expect(out.ai.map((a) => a.link)).toEqual(["a1", "a2"]);
    expect(out.crypto.map((a) => a.link)).toEqual(["c1"]);
  });

  it("localizes titles per lang with fallback on the raw feed title", () => {
    const rows = [
      row({ link: "a1" }),
      row({ link: "a2", title_ai_fr: null, title_ai_en: null }),
      row({ link: "a3", title_ai_fr: "   ", title_ai_en: "  " }),
    ];
    const fr = groupArticlesByTopic(rows, 5, "fr");
    expect(fr.ai.map((a) => a.title)).toEqual(["Titre IA FR", "Raw title", "Raw title"]);
    const en = groupArticlesByTopic(rows, 5, "en");
    expect(en.ai.map((a) => a.title)).toEqual(["AI title EN", "Raw title", "Raw title"]);
  });

  it("maps the MiniArticle field names (pubDate, score)", () => {
    const out = groupArticlesByTopic([row({ relevance_score: null })], 3, "en");
    expect(out.ai[0]).toEqual({
      title: "AI title EN",
      link: "https://example.com/a",
      source: "Example",
      pubDate: "2026-06-12T08:00:00Z",
      score: null,
    });
  });

  it("returns an empty record for no rows", () => {
    expect(groupArticlesByTopic([], 3, "en")).toEqual({});
  });
});
