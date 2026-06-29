import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCompletion: vi.fn(),
  countArticlesForPeriod: vi.fn(),
  deleteDailySummaryById: vi.fn(),
  getDailySummary: vi.fn(),
  getScoredArticles: vi.fn(),
  getTopicPrompt: vi.fn(),
  insertDailySummary: vi.fn(),
  insertSummaryBullets: vi.fn(),
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mocks.createCompletion,
      },
    },
  })),
}));

vi.mock("@/lib/supabase", () => ({
  countArticlesForPeriod: mocks.countArticlesForPeriod,
  deleteDailySummaryById: mocks.deleteDailySummaryById,
  getDailySummary: mocks.getDailySummary,
  getScoredArticles: mocks.getScoredArticles,
  getTopicPrompt: mocks.getTopicPrompt,
  insertDailySummary: mocks.insertDailySummary,
  insertSummaryBullets: mocks.insertSummaryBullets,
}));

import { generateDailySummary } from "../generate-daily-summary";

const ORIGINAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function restoreEnv() {
  if (ORIGINAL_OPENAI_API_KEY === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_API_KEY;
  }
}

describe("generateDailySummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-openai-key";
    mocks.getDailySummary.mockResolvedValue(null);
    mocks.getTopicPrompt.mockResolvedValue({
      prompt_en: "Summarize up to {{max}} articles.",
      prompt_fr: "Résume jusqu'à {{max}} articles.",
    });
    mocks.getScoredArticles.mockResolvedValue([
      {
        id: 1,
        topic: "ai",
        source: "Test Source",
        title: "OpenAI ships agent update",
        link: "https://example.com/openai-agent",
        pub_date: "2026-06-28T10:00:00.000Z",
        fetched_at: "2026-06-28T10:05:00.000Z",
        content: "Long article content",
        snippet: "Original snippet",
        snippet_ai_en: "AI snippet",
        snippet_ai_fr: "Snippet IA",
        relevance_score: 9,
      },
    ]);
    mocks.countArticlesForPeriod.mockResolvedValue({ total: 1, scored: 1 });
    mocks.createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              relevant: [{ index: 0, title: "Agent update", snippet: "A concrete agent update shipped." }],
              globalSummary: [
                {
                  text: "OpenAI shipped a concrete agent update with measurable developer workflow changes.",
                  refs: [0],
                  entities: ["OpenAI"],
                },
              ],
              seoKeywords: ["openai", "agent", "workflow"],
              seoTitle: "OpenAI agent update",
              seoDescription: "OpenAI ships a concrete agent update for developer workflows.",
            }),
          },
        },
      ],
    });
    mocks.insertDailySummary.mockResolvedValue(123);
  });

  afterEach(() => {
    restoreEnv();
  });

  it("cleans up an incomplete daily summary when bullet persistence fails", async () => {
    mocks.insertSummaryBullets.mockResolvedValue(false);
    mocks.deleteDailySummaryById.mockResolvedValue(true);

    const result = await generateDailySummary("ai", "2026-06-28", "en");

    expect(result?.status).toBe("error");
    expect(mocks.insertSummaryBullets).toHaveBeenCalledWith([
      expect.objectContaining({
        daily_summary_id: 123,
        topic_id: "ai",
        lang: "en",
        summary_date: "2026-06-28",
        source_type: "daily_summary",
      }),
    ]);
    expect(mocks.deleteDailySummaryById).toHaveBeenCalledWith(123);
  });

  it("does not delete a complete daily summary", async () => {
    mocks.insertSummaryBullets.mockResolvedValue(true);

    const result = await generateDailySummary("ai", "2026-06-28", "en");

    expect(result?.status).toBe("generated");
    expect(mocks.deleteDailySummaryById).not.toHaveBeenCalled();
  });
});
