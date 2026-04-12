import { NextRequest, NextResponse } from "next/server";
import { getServerMessages, analyzeWithAI } from "@/lib/ai-analyze";
import { cleanExpiredCache, getCachedResult, setCachedResult } from "@/lib/supabase";
import type { Lang } from "@/lib/i18n";
import type { ArticleSummary, SummaryResponse } from "@/lib/types";
import { createHash } from "crypto";

export const maxDuration = 60;

function generateHomepageSummaryPrompt(lang: Lang): string {
  if (lang === "fr") {
    return [
      "Tu es un rédacteur en chef spécialisé dans l'actualité technologique. Tu produis un briefing quotidien de haut niveau.",
      "Tu reçois les 50 articles tech les mieux notés des dernières 24 heures.",
      "",
      "Règles strictes :",
      "1. Regroupe les articles par grand thème HOMOGÈNE (ex : Intelligence Artificielle, Cybersécurité, Cloud & Infrastructure, Hardware & Semi-conducteurs, Startups & Levées de fonds, Régulation & Politique tech…).",
      "2. Chaque bullet point doit couvrir UN SEUL thème cohérent. Ne mélange JAMAIS des sujets sans rapport (ex : ne parle pas de géopolitique dans un bullet sur l'IA, sauf si le lien technologique est direct comme les puces d'IA soumises à embargo).",
      "3. Pour chaque bullet point, rédige 3 à 5 phrases détaillées : explique les faits, nomme les entreprises/acteurs clés, et explique pourquoi c'est important pour l'industrie tech.",
      "4. Intègre systématiquement les CHIFFRES et DONNÉES concrètes mentionnés dans les articles (montants levés, pourcentages de croissance, nombre d'utilisateurs, benchmarks, prix, parts de marché…). Ajoute des ANECDOTES marquantes ou des détails surprenants quand les articles en contiennent, pour rendre le briefing vivant et mémorable.",
      "5. Produis entre 8 et 15 bullet points selon la richesse de l'actualité.",
      "6. Chaque bullet point DOIT référencer dans \"refs\" les indices de TOUS les articles qui alimentent ce point. C'est essentiel pour que le lecteur puisse accéder aux sources.",
      "7. Si un article ne rentre dans aucun groupe cohérent, ignore-le plutôt que de forcer un regroupement artificiel.",
      "8. Sois factuel, précis et informatif. Le ton doit être celui d'un analyste tech professionnel qui sait captiver son audience.",
      "",
      "Réponds en JSON : {\"relevant\":[{\"index\":0,\"snippet\":\"résumé court\"}],\"globalSummary\":[{\"text\":\"bullet point détaillé\",\"refs\":[0,1,...]}]}",
    ].join("\n");
  }
  return [
    "You are an editor-in-chief specializing in technology news. You produce a high-level daily briefing.",
    "You receive the top 50 highest-scored tech articles from the last 24 hours.",
    "",
    "Strict rules:",
    "1. Group articles by HOMOGENEOUS theme (e.g. Artificial Intelligence, Cybersecurity, Cloud & Infrastructure, Hardware & Semiconductors, Startups & Fundraising, Tech Regulation & Policy…).",
    "2. Each bullet point must cover ONE coherent theme. NEVER mix unrelated topics (e.g. do not mention geopolitics in an AI bullet unless the tech link is direct, like AI chips under embargo).",
    "3. For each bullet point, write 3-5 detailed sentences: explain the facts, name the key companies/players, and explain why it matters for the tech industry.",
    "4. Systematically include NUMBERS and CONCRETE DATA from the articles (funding amounts, growth percentages, user counts, benchmarks, prices, market share…). Add striking ANECDOTES or surprising details when the articles contain them, to make the briefing vivid and memorable.",
    "5. Produce 8-15 bullet points depending on how rich the news cycle is.",
    "6. Each bullet point MUST reference in \"refs\" the indices of ALL articles that feed into that point. This is essential so readers can access the sources.",
    "7. If an article does not fit any coherent group, skip it rather than forcing an artificial grouping.",
    "8. Be factual, precise, and informative. The tone should be that of a professional tech analyst who knows how to captivate their audience.",
    "",
    "Respond with JSON: {\"relevant\":[{\"index\":0,\"snippet\":\"short summary\"}],\"globalSummary\":[{\"text\":\"detailed bullet point\",\"refs\":[0,1,...]}]}",
  ].join("\n");
}

interface TopSummaryBody {
  articles: Array<{
    title: string;
    snippet: string;
    link: string;
    source: string;
    pubDate: string;
  }>;
  lang: "en" | "fr";
}

function buildHomepageCacheKey(items: ArticleSummary[]): string {
  // Normalize ordering to avoid cache misses caused by tie-order
  // differences in top-article queries.
  const normalized = [...items].sort((a, b) => {
    const lk = a.link.localeCompare(b.link);
    if (lk !== 0) return lk;
    const pk = a.pubDate.localeCompare(b.pubDate);
    if (pk !== 0) return pk;
    return a.source.localeCompare(b.source);
  });
  const digest = createHash("sha256")
    .update(
      normalized
        .map((a) => `${a.link}|${a.pubDate}|${a.source}`)
        .join("\n"),
    )
    .digest("hex")
    .slice(0, 16);
  return `home_top_summary:${digest}`;
}

export async function POST(request: NextRequest) {
  try {
    const body: TopSummaryBody = await request.json();
    const { articles, lang: rawLang } = body;
    const lang: Lang = rawLang === "fr" ? "fr" : "en";

    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json({ error: "Missing or empty articles" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.trim() === "" || apiKey === "sk-your-key-here") {
      const msg = getServerMessages(lang);
      return NextResponse.json({
        summary: msg.noApiKey(articles.length, 0),
        bullets: [],
        articles: [],
        allArticles: [],
        period: { from: "", to: "" },
      } satisfies SummaryResponse);
    }

    const items: ArticleSummary[] = articles.map((a) => ({
      title: a.title,
      link: a.link,
      source: a.source,
      pubDate: a.pubDate,
      snippet: (a.snippet || "").slice(0, 250),
    }));
    const cacheTopic = buildHomepageCacheKey(items);
    const cached = (await getCachedResult(cacheTopic, lang, 24, items.length)) as SummaryResponse | null;
    if (cached) {
      return NextResponse.json(cached, {
        headers: { "X-Cache": "HIT" },
      });
    }

    const systemPrompt = generateHomepageSummaryPrompt(lang);
    const msg = getServerMessages(lang);

    let summary: string;
    let bullets: SummaryResponse["bullets"];

    try {
      const result = await analyzeWithAI(items, systemPrompt, lang, apiKey, "gpt-5.3-chat-latest");
      summary = result.summary;
      bullets = result.bullets;
    } catch (e) {
      console.error("[top-summary] analyzeWithAI error:", e);
      summary = msg.aiError;
      bullets = [];
    }

    const now = new Date().toISOString();

    const response = {
      summary,
      bullets,
      articles: items,
      allArticles: [],
      period: { from: now, to: now },
      meta: {
        totalArticles: articles.length,
        scoredArticles: articles.length,
        analyzedArticles: articles.length,
      },
    } satisfies SummaryResponse;

    setCachedResult(cacheTopic, lang, 24, items.length, response).catch(() => {});
    if (Math.random() < 0.1) cleanExpiredCache().catch(() => {});

    return NextResponse.json(response, {
      headers: { "X-Cache": "MISS" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
