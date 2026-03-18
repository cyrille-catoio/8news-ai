import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";
import OpenAI from "openai";
import { getFeedsForTopic, type Feed } from "@/lib/rss-feeds";
import { getSystemPrompt, getServerMessages } from "@/lib/prompts";
import { getCachedResult, setCachedResult, cleanExpiredCache } from "@/lib/supabase";
import type { Lang } from "@/lib/i18n";
import type { RawArticle, ArticleSummary, SummaryBullet, SummaryResponse, AIAnalysis, Topic } from "@/lib/types";

const rssParser = new Parser({ timeout: 5_000 });
const FETCH_TIMEOUT_MS = 5_000;
const MAX_ARTICLES = 200;
const PREVIEW_LIMIT = 10;
const SNIPPET_MAX = 600;

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

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&apos;": "'", "&nbsp;": " ",
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (match) => HTML_ENTITIES[match] ?? match);
}

// ── RSS fetching ──────────────────────────────────────────────────────

async function fetchAllFeeds(feeds: readonly Feed[], since: number): Promise<{
  articles: RawArticle[];
  feedsOk: number;
  feedsFailed: number;
}> {
  const articles: RawArticle[] = [];

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const xml = await fetch(feed.url, {
        headers: { "User-Agent": "NewsRead/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }).then((r) => r.text());

      const parsed = await rssParser.parseString(xml);

      for (const item of parsed.items ?? []) {
        const pubDate = item.pubDate ?? item.isoDate ?? "";
        if (toTimestamp(pubDate) >= since) {
          articles.push({
            title: decodeHtmlEntities(item.title ?? ""),
            link: item.link ?? "",
            pubDate: pubDate || new Date().toISOString(),
            content: decodeHtmlEntities(item.content ?? ""),
            contentSnippet: decodeHtmlEntities(item.contentSnippet ?? ""),
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
      `[${i}] ${a.title} | ${a.source} | ${a.pubDate.slice(0, 10)} | ${a.snippet.slice(0, 500)}`
    )
    .join("\n");
}

interface RelevantEntry {
  snippet: string;
  title?: string;
}

async function analyzeWithAI(
  items: ArticleSummary[],
  topic: Topic,
  lang: Lang,
  apiKey: string,
  maxArticles: number,
): Promise<{ summary: string; bullets: SummaryBullet[]; relevant: Map<number, RelevantEntry> }> {
  const msg = getServerMessages(lang);
  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: getSystemPrompt(topic, lang, maxArticles) },
      { role: "user", content: `Article list:\n${formatArticleList(items)}` },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return { summary: msg.fallback, bullets: [], relevant: new Map() };

  const parsed: AIAnalysis = JSON.parse(raw);
  const relevant = new Map<number, RelevantEntry>();
  for (const r of parsed.relevant ?? []) {
    relevant.set(r.index, { snippet: r.snippet, title: r.title });
  }

  let summaryText: string;
  let bullets: SummaryBullet[] = [];

  if (Array.isArray(parsed.globalSummary)) {
    const arr = parsed.globalSummary as Array<{ text: string; refs?: number[] }>;
    bullets = arr.map((b) => ({
      text: (typeof b === "string" ? b : b.text ?? "").replace(/^•\s*/, "").trim(),
      refs: (b.refs ?? [])
        .filter((idx) => idx >= 0 && idx < items.length)
        .map((idx) => ({
          title: items[idx].title,
          link: items[idx].link,
          source: items[idx].source,
        })),
    })).filter((b) => b.text.length > 0);
    summaryText = bullets.map((b) => `• ${b.text}`).join("\n");
  } else {
    const str = typeof parsed.globalSummary === "string" ? parsed.globalSummary : msg.fallback;
    summaryText = str;
    bullets = str
      .split("\n")
      .map((line) => line.replace(/^•\s*/, "").trim())
      .filter(Boolean)
      .map((text) => ({ text, refs: [] }));
  }

  return {
    summary: summaryText || msg.fallback,
    bullets,
    relevant,
  };
}

// ── Route handler ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const lang: Lang = params.get("lang") === "fr" ? "fr" : "en";
    const rawTopic = params.get("topic");
    const topic: Topic = rawTopic === "ai" ? "ai" : rawTopic === "crypto" ? "crypto" : rawTopic === "robotics" ? "robotics" : rawTopic === "bitcoin" ? "bitcoin" : rawTopic === "videogames" ? "videogames" : rawTopic === "aiengineering" ? "aiengineering" : "conflict";
    const maxArticles = Math.min(30, Math.max(3, parseInt(params.get("count") ?? "10", 10) || 10));
    const hours = Math.min(168, Math.max(0.25, parseFloat(params.get("hours") ?? "24") || 24));
    const since = Date.now() - hours * 3_600_000;
    const msg = getServerMessages(lang);

    // ── Cache check ──────────────────────────────────────────────────
    const apiKey = process.env.OPENAI_API_KEY;
    if (isValidApiKey(apiKey)) {
      const cached = await getCachedResult(topic, lang, hours, maxArticles);
      if (cached) {
        return NextResponse.json(cached satisfies SummaryResponse);
      }
    }

    const feeds = getFeedsForTopic(topic);
    const { articles: rawArticles, feedsOk, feedsFailed } = await fetchAllFeeds(feeds, since);
    const items = toAnalysisPayload(rawArticles);

    const allArticles: ArticleSummary[] = items.map((a) => ({
      ...a,
      snippet: a.snippet.slice(0, 300),
    }));

    if (items.length === 0) {
      return NextResponse.json({
        summary: feedsFailed > 0
          ? msg.noArticlesFeedError(feedsOk, feedsFailed)
          : msg.noArticles,
        bullets: [],
        articles: [],
        allArticles: [],
        period: buildPeriod(since),
      } satisfies SummaryResponse);
    }

    if (!isValidApiKey(apiKey)) {
      return NextResponse.json({
        summary: msg.noApiKey(items.length, feedsOk),
        bullets: [],
        articles: items.slice(0, PREVIEW_LIMIT).map((a) => ({
          ...a,
          snippet: a.snippet.slice(0, 200),
        })),
        allArticles,
        period: buildPeriod(since),
      } satisfies SummaryResponse);
    }

    let summary: string;
    let bullets: SummaryBullet[];
    let relevant: Map<number, RelevantEntry>;

    try {
      ({ summary, bullets, relevant } = await analyzeWithAI(items, topic, lang, apiKey, maxArticles));
    } catch {
      summary = msg.aiError;
      bullets = [];
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

    const result: SummaryResponse = {
      summary,
      bullets,
      articles: filteredArticles,
      allArticles,
      period: buildPeriod(since),
    };

    // ── Cache write (non-blocking) ──────────────────────────────────
    if (filteredArticles.length > 0) {
      setCachedResult(topic, lang, hours, maxArticles, result).catch(() => {});
      if (Math.random() < 0.1) cleanExpiredCache().catch(() => {});
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
