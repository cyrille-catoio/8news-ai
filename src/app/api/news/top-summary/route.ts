import { NextRequest, NextResponse } from "next/server";
import { getServerMessages } from "@/lib/ai-analyze";
import {
  getLatestTopSummary,
  getTopSummaryBulletsByDate,
} from "@/lib/supabase";
import { generateTopSummary } from "@/lib/generate-top-summary";
import { todayUtc } from "@/lib/dates-utc";
import type { Lang } from "@/lib/i18n";
import type { ArticleSummary, SummaryResponse } from "@/lib/types";

export const maxDuration = 60;

/**
 * Legacy on-demand entry point for the Top articles AI summary.
 *
 * The /top-articles UI no longer calls this — visitors read the
 * pre-computed snapshot via `GET /api/news/top-summary/latest`,
 * written by `cron-top-summary-background.ts`. This POST route is
 * kept for two scenarios:
 *
 *  - **Manual replay**: an admin / curl can force a fresh generation
 *    for « today » without waiting for the next cron tick.
 *  - **Debug**: pass a custom `articles` array in the body to test
 *    the LLM prompt against an arbitrary input set.
 *
 * The route now delegates to `generateTopSummary` (the shared lib
 * also used by the cron) so the persistence path is identical:
 * `top_summaries` snapshot + `summary_bullets` mirror. After
 * generation we re-read the snapshot and return it in the same shape
 * as the GET endpoint, so any tooling still consuming this route's
 * response keeps working.
 */

interface TopSummaryBody {
  articles?: Array<{
    title: string;
    snippet: string;
    link: string;
    source: string;
    pubDate: string;
    topic?: string;
  }>;
  lang: "en" | "fr";
  /** Optional snapshot date (YYYY-MM-DD). Defaults to today UTC. */
  date?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: TopSummaryBody = await request.json();
    const lang: Lang = body.lang === "fr" ? "fr" : "en";
    const summaryDate = body.date?.trim() || todayUtc();
    const msg = getServerMessages(lang);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.trim() === "" || apiKey === "sk-your-key-here") {
      return NextResponse.json({
        summary: msg.noApiKey(0, 0),
        bullets: [],
        articles: [],
        allArticles: [],
        period: { from: "", to: "" },
      } satisfies SummaryResponse);
    }

    const articlesOverride = (body.articles && body.articles.length > 0
      ? body.articles.map((a) => ({
          title: a.title,
          link: a.link,
          source: a.source,
          pubDate: a.pubDate,
          snippet: (a.snippet || "").slice(0, 250),
          topic: a.topic,
        }))
      : undefined);

    const result = await generateTopSummary(summaryDate, lang, { articlesOverride });

    if (result.status !== "ok") {
      const errorMessage =
        result.status === "no_articles"
          ? msg.noArticles
          : result.status === "no_openai"
          ? msg.noApiKey(0, 0)
          : msg.aiError;
      return NextResponse.json(
        {
          summary: errorMessage,
          bullets: [],
          articles: [],
          allArticles: [],
          period: { from: "", to: "" },
          error: result.errorMessage,
        },
        { status: result.status === "no_articles" ? 404 : 502 },
      );
    }

    // Re-read the snapshot we just wrote so the response matches the
    // shape served by GET /latest exactly. Avoids any drift if we ever
    // change the persistence shape.
    const snapshot = await getLatestTopSummary(lang);
    const bulletRows = snapshot
      ? await getTopSummaryBulletsByDate(lang, snapshot.summary_date)
      : [];

    const bullets = bulletRows.map((b) => {
      const text = b.title
        ? b.text.replace(new RegExp(`^\\*\\*${escapeRegExp(b.title)}\\*\\*\\s*\\n+`), "").trim()
        : b.text.trim();
      return { text, title: b.title, refs: b.refs ?? [] };
    });

    const articles: ArticleSummary[] = (snapshot?.articles ?? []).map((a) => ({
      title: a.title,
      link: a.link,
      source: a.source,
      pubDate: a.pubDate,
      snippet: a.snippet,
    }));

    const response: SummaryResponse & { summaryDate?: string; generatedAt?: string } = {
      summary: snapshot?.summary_md ?? "",
      bullets,
      articles,
      allArticles: [],
      period: {
        from: snapshot?.generated_at ?? "",
        to: snapshot?.generated_at ?? "",
      },
      meta: {
        totalArticles: result.articleCount,
        scoredArticles: result.articleCount,
        analyzedArticles: result.articleCount,
      },
      summaryDate: snapshot?.summary_date,
      generatedAt: snapshot?.generated_at,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
