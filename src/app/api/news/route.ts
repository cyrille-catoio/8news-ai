import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSystemPrompt, getServerMessages } from "@/lib/prompts";
import { getCachedResult, setCachedResult, cleanExpiredCache, getScoredArticles, getAllArticlesFromDb } from "@/lib/supabase";
import type { Lang } from "@/lib/i18n";
import { VALID_TOPICS } from "@/lib/types";
import type { ArticleSummary, SummaryBullet, SummaryResponse, AIAnalysis, Topic } from "@/lib/types";

const MAX_ARTICLES = 200;
const PREVIEW_LIMIT = 10;
const SNIPPET_MAX = 600;

export const maxDuration = 60;

function buildPeriod(since: number): SummaryResponse["period"] {
  return {
    from: new Date(since).toISOString(),
    to: new Date().toISOString(),
  };
}

function isValidApiKey(key: string | undefined): key is string {
  return !!key && key.trim() !== "" && key !== "sk-your-key-here";
}

function getMinScore(hours: number): number {
  if (hours <= 1) return 3;
  if (hours <= 6) return 4;
  if (hours <= 12) return 5;
  if (hours <= 48) return 6;
  return 7;
}

// ── Read articles from Supabase ──────────────────────────────────────

function toArticleSummary(
  r: { title: string; link: string; source: string; pub_date: string; snippet: string | null; content: string | null },
  maxSnippet: number,
): ArticleSummary {
  return {
    title: r.title,
    link: r.link,
    source: r.source,
    pubDate: r.pub_date,
    snippet: (r.snippet || r.content || "").slice(0, maxSnippet),
  };
}

// ── AI analysis ───────────────────────────────────────────────────────

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
    model: "gpt-4.1-nano",
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
    const rawTopic = params.get("topic") as Topic | null;
    const topic: Topic = rawTopic && VALID_TOPICS.includes(rawTopic) ? rawTopic : "conflict";
    const maxArticles = Math.min(30, Math.max(3, parseInt(params.get("count") ?? "10", 10) || 10));
    const hours = Math.min(168, Math.max(0.25, parseFloat(params.get("hours") ?? "24") || 24));
    const since = Date.now() - hours * 3_600_000;
    const sinceISO = new Date(since).toISOString();
    const msg = getServerMessages(lang);

    // ── Cache check ──────────────────────────────────────────────────
    const apiKey = process.env.OPENAI_API_KEY;
    if (isValidApiKey(apiKey)) {
      const cached = await getCachedResult(topic, lang, hours, maxArticles);
      if (cached) {
        return NextResponse.json(cached satisfies SummaryResponse);
      }
    }

    // ── Read scored + all articles from DB ───────────────────────────
    const minScore = getMinScore(hours);
    const [scoredRows, allRows] = await Promise.all([
      getScoredArticles(topic, sinceISO, minScore, maxArticles * 2),
      getAllArticlesFromDb(topic, sinceISO, MAX_ARTICLES),
    ]);

    const items = scoredRows.map((r) => toArticleSummary(r, SNIPPET_MAX));
    const allArticles = allRows.map((r) => toArticleSummary(r, 300));

    if (items.length === 0) {
      return NextResponse.json({
        summary: msg.noArticles,
        bullets: [],
        articles: [],
        allArticles,
        period: buildPeriod(since),
      } satisfies SummaryResponse);
    }

    if (!isValidApiKey(apiKey)) {
      return NextResponse.json({
        summary: msg.noApiKey(items.length, 0),
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
