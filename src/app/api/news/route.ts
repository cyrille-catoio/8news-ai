import { NextRequest, NextResponse } from "next/server";
import { getCachedResult, setCachedResult, cleanExpiredCache, getScoredArticles, getTopicPrompt, countArticlesForPeriod } from "@/lib/supabase";
import { getServerMessages, generateFallbackPrompt, analyzeWithAI, type RelevantEntry } from "@/lib/ai-analyze";
import type { Lang } from "@/lib/i18n";
import type { ArticleSummary, SummaryBullet, SummaryResponse } from "@/lib/types";

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
  r: { title: string; link: string; source: string; pub_date: string; snippet: string | null; content: string | null; snippet_ai_en?: string | null; snippet_ai_fr?: string | null },
  maxSnippet: number,
  lang?: Lang,
): ArticleSummary {
  const aiSnippet = lang === "fr" ? r.snippet_ai_fr : r.snippet_ai_en;
  return {
    title: r.title,
    link: r.link,
    source: r.source,
    pubDate: r.pub_date,
    snippet: aiSnippet || (r.snippet || r.content || "").slice(0, maxSnippet),
  };
}

// ── Route handler ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const lang: Lang = params.get("lang") === "fr" ? "fr" : "en";
    const rawTopic = params.get("topic");
    if (!rawTopic) {
      return NextResponse.json({ error: "Missing topic parameter" }, { status: 400 });
    }
    const maxArticles = Math.min(100, Math.max(3, parseInt(params.get("count") ?? "10", 10) || 10));

    const topicPrompt = await getTopicPrompt(rawTopic);
    if (!topicPrompt) {
      return NextResponse.json({ error: "Invalid or inactive topic" }, { status: 400 });
    }
    const topic = rawTopic;

    const promptTemplate = lang === "fr" ? topicPrompt.prompt_fr : topicPrompt.prompt_en;
    const systemPrompt = promptTemplate
      ? promptTemplate.replace(/\{\{max\}\}/g, String(maxArticles))
      : generateFallbackPrompt(lang);
    const hours = Math.min(168, Math.max(0.25, parseFloat(params.get("hours") ?? "24") || 24));
    const since = Date.now() - hours * 3_600_000;
    const sinceISO = new Date(since).toISOString();
    const msg = getServerMessages(lang);

    // ── Cache check ──────────────────────────────────────────────────
    const apiKey = process.env.OPENAI_API_KEY;
    /** Bumps when French article card copy logic changes (invalidates stale cached EN snippets). */
    const cacheLang = lang === "fr" ? "fr@sel-fr" : lang;
    if (isValidApiKey(apiKey)) {
      const cached = await getCachedResult(topic, cacheLang, hours, maxArticles);
      if (cached) {
        return NextResponse.json(cached satisfies SummaryResponse);
      }
    }

    // ── Read scored articles from DB ────────────────────────────────
    const minScore = getMinScore(hours);
    const [scoredRows, counts] = await Promise.all([
      getScoredArticles(topic, sinceISO, minScore, maxArticles),
      countArticlesForPeriod(topic, sinceISO),
    ]);

    const items = scoredRows.map((r) => toArticleSummary(r, SNIPPET_MAX, lang));

    const meta = {
      totalArticles: counts.total,
      scoredArticles: counts.scored,
      analyzedArticles: items.length,
    };

    if (items.length === 0) {
      return NextResponse.json({
        summary: msg.noArticles,
        bullets: [],
        articles: [],
        allArticles: [],
        period: buildPeriod(since),
        meta,
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
        allArticles: [],
        period: buildPeriod(since),
        meta,
      } satisfies SummaryResponse);
    }

    let summary: string;
    let bullets: SummaryBullet[];
    let relevant: Map<number, RelevantEntry>;

    try {
      ({ summary, bullets, relevant } = await analyzeWithAI(items, systemPrompt, lang, apiKey));
    } catch {
      summary = msg.aiError;
      bullets = [];
      relevant = new Map();
    }

    const filteredArticles: ArticleSummary[] = items.map((a, i) => {
      const entry = relevant.get(i);
      const row = scoredRows[i];
      if (lang === "fr") {
        const hasDbFrSnippet = !!(row?.snippet_ai_fr && row.snippet_ai_fr.trim());
        return {
          ...a,
          title: (entry?.title && entry.title.trim()) || a.title,
          snippet: hasDbFrSnippet
            ? a.snippet
            : (entry?.snippet && entry.snippet.trim()) || a.snippet,
        };
      }
      return {
        ...a,
        title: entry?.title || a.title,
        snippet: entry?.snippet || a.snippet,
      };
    });

    const result: SummaryResponse = {
      summary,
      bullets,
      articles: filteredArticles,
      allArticles: [],
      period: buildPeriod(since),
      meta,
    };

    // ── Cache write (non-blocking) ──────────────────────────────────
    if (filteredArticles.length > 0) {
      setCachedResult(topic, cacheLang, hours, maxArticles, result).catch(() => {});
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
