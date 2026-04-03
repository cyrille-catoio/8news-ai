import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getCachedResult, setCachedResult, cleanExpiredCache, getScoredArticles, getTopicPrompt, countArticlesForPeriod } from "@/lib/supabase";
import type { Lang } from "@/lib/i18n";
import type { ArticleSummary, SummaryBullet, SummaryResponse, AIAnalysis } from "@/lib/types";

const PREVIEW_LIMIT = 10;
const SNIPPET_MAX = 600;

function getServerMessages(lang: Lang) {
  if (lang === "fr") {
    return {
      noArticles: "Aucun article trouvé pour la période sélectionnée.",
      noApiKey: (count: number, feeds: number) =>
        `${count} articles récupérés depuis ${feeds} flux. Configurez OPENAI_API_KEY dans .env pour activer le filtrage IA.`,
      aiError:
        "Erreur lors de l'appel à OpenAI. Vérifiez que votre OPENAI_API_KEY est valide.",
      fallback: "Impossible de générer le résumé.",
    } as const;
  }
  return {
    noArticles: "No articles found for the selected time period.",
    noApiKey: (count: number, feeds: number) =>
      `${count} articles fetched from ${feeds} feeds. Set OPENAI_API_KEY in .env to enable AI filtering.`,
    aiError:
      "Error calling OpenAI. Please verify that your OPENAI_API_KEY is valid.",
    fallback: "Unable to generate summary.",
  } as const;
}

function generateFallbackPrompt(lang: Lang): string {
  if (lang === "fr") {
    return `Tu es un analyste de presse. Résume TOUS les articles fournis. Pour chaque article, écris un résumé factuel de 2-3 phrases. Produis jusqu'à 8 bullet points factuels couvrant les sujets majeurs. Réponds en JSON: {"relevant":[{"index":0,"snippet":"..."}],"globalSummary":[{"text":"...","refs":[0]}]}`;
  }
  return `You are a news analyst. Summarize ALL articles provided. For each article, write a factual 2-3 sentence summary. Write up to 8 factual bullet points covering the major topics. Respond with JSON: {"relevant":[{"index":0,"snippet":"..."}],"globalSummary":[{"text":"...","refs":[0]}]}`;
}

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

// ── AI analysis ───────────────────────────────────────────────────────

function formatArticleList(items: ArticleSummary[]): string {
  return items
    .map((a, i) =>
      `[${i}] ${a.title} | ${a.source} | ${a.pubDate.slice(0, 10)} | ${a.snippet.slice(0, 300)}`
    )
    .join("\n");
}

interface RelevantEntry {
  snippet: string;
  title?: string;
}

async function analyzeWithAI(
  items: ArticleSummary[],
  systemPrompt: string,
  lang: Lang,
  apiKey: string,
): Promise<{ summary: string; bullets: SummaryBullet[]; relevant: Map<number, RelevantEntry> }> {
  const msg = getServerMessages(lang);
  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-nano",
    messages: [
      { role: "system", content: systemPrompt },
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
    if (isValidApiKey(apiKey)) {
      const cached = await getCachedResult(topic, lang, hours, maxArticles);
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
