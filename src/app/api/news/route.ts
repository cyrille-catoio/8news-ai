import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";
import OpenAI from "openai";
import { RSS_FEEDS } from "@/lib/rss-feeds";
import { getSystemPrompt, getServerMessages } from "@/lib/prompts";
import type { Lang } from "@/lib/i18n";
import type { RawArticle, ArticleSummary, SummaryResponse, AIAnalysis } from "@/lib/types";

const rssParser = new Parser({ timeout: 10_000 });
const FETCH_TIMEOUT_MS = 8_000;
const MAX_ARTICLES = 80;
const PREVIEW_LIMIT = 10;
const SNIPPET_MAX = 400;

function toTimestamp(dateStr: string | undefined): number {
  if (!dateStr) return 0;
  const ms = new Date(dateStr).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function buildPeriod(since: number): SummaryResponse["period"] {
  return {
    from: new Date(since).toISOString(),
    to: new Date().toISOString(),
  };
}

function isValidApiKey(key: string | undefined): key is string {
  return !!key && key.trim() !== "" && key !== "sk-your-key-here";
}

// ── RSS fetching ──────────────────────────────────────────────────────

async function fetchAllFeeds(since: number): Promise<{
  articles: RawArticle[];
  feedsOk: number;
  feedsFailed: number;
}> {
  const articles: RawArticle[] = [];

  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const xml = await fetch(feed.url, {
        headers: { "User-Agent": "NewsRead/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }).then((r) => r.text());

      const parsed = await rssParser.parseString(xml);

      for (const item of parsed.items ?? []) {
        const pubDate = item.pubDate ?? item.isoDate ?? "";
        if (toTimestamp(pubDate) >= since) {
          articles.push({
            title: item.title ?? "",
            link: item.link ?? "",
            pubDate: pubDate || new Date().toISOString(),
            content: item.content ?? "",
            contentSnippet: item.contentSnippet ?? "",
            source: feed.name,
          });
        }
      }
    })
  );

  const feedsOk = results.filter((r) => r.status === "fulfilled").length;
  const feedsFailed = results.length - feedsOk;

  articles.sort((a, b) => toTimestamp(b.pubDate) - toTimestamp(a.pubDate));

  return { articles, feedsOk, feedsFailed };
}

// ── AI analysis ───────────────────────────────────────────────────────

function toAnalysisPayload(articles: RawArticle[]): ArticleSummary[] {
  return articles.slice(0, MAX_ARTICLES).map((a) => ({
    title: a.title,
    link: a.link,
    source: a.source,
    pubDate: a.pubDate,
    snippet: (a.contentSnippet || a.content).slice(0, SNIPPET_MAX),
  }));
}

function formatArticleList(items: ArticleSummary[]): string {
  return items
    .map((a, i) =>
      `[${i}] ${a.title} | ${a.source} | ${a.pubDate.slice(0, 10)} | ${a.snippet.slice(0, 200)}`
    )
    .join("\n");
}

interface RelevantEntry {
  snippet: string;
  title?: string;
}

async function analyzeWithAI(
  items: ArticleSummary[],
  lang: Lang,
  apiKey: string,
): Promise<{ summary: string; relevant: Map<number, RelevantEntry> }> {
  const msg = getServerMessages(lang);
  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: getSystemPrompt(lang) },
      { role: "user", content: `Article list:\n${formatArticleList(items)}` },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return { summary: msg.fallback, relevant: new Map() };

  const parsed: AIAnalysis = JSON.parse(raw);
  const relevant = new Map<number, RelevantEntry>();
  for (const r of parsed.relevant ?? []) {
    relevant.set(r.index, { snippet: r.snippet, title: r.title });
  }

  return {
    summary: parsed.globalSummary || msg.fallback,
    relevant,
  };
}

// ── Route handler ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const lang: Lang = params.get("lang") === "fr" ? "fr" : "en";
    const hours = Math.min(48, Math.max(0.25, parseFloat(params.get("hours") ?? "24") || 24));
    const since = Date.now() - hours * 3_600_000;
    const msg = getServerMessages(lang);

    const { articles: rawArticles, feedsOk, feedsFailed } = await fetchAllFeeds(since);
    const items = toAnalysisPayload(rawArticles);

    if (items.length === 0) {
      return NextResponse.json({
        summary: feedsFailed > 0
          ? msg.noArticlesFeedError(feedsOk, feedsFailed)
          : msg.noArticles,
        articles: [],
        period: buildPeriod(since),
      } satisfies SummaryResponse);
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!isValidApiKey(apiKey)) {
      return NextResponse.json({
        summary: msg.noApiKey(items.length, feedsOk),
        articles: items.slice(0, PREVIEW_LIMIT).map((a) => ({
          ...a,
          snippet: a.snippet.slice(0, 200),
        })),
        period: buildPeriod(since),
      } satisfies SummaryResponse);
    }

    let summary: string;
    let relevant: Map<number, RelevantEntry>;

    try {
      ({ summary, relevant } = await analyzeWithAI(items, lang, apiKey));
    } catch {
      summary = msg.aiError;
      relevant = new Map();
    }

    const filteredArticles: ArticleSummary[] = items
      .map((a, i) => {
        const entry = relevant.get(i);
        if (!entry) return null;
        return {
          ...a,
          title: entry.title || a.title,
          snippet: entry.snippet,
        };
      })
      .filter((a): a is ArticleSummary => a !== null);

    return NextResponse.json({
      summary,
      articles: filteredArticles,
      period: buildPeriod(since),
    } satisfies SummaryResponse);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
