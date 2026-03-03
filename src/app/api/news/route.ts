import { NextRequest } from "next/server";
import Parser from "rss-parser";
import OpenAI from "openai";
import { RSS_FEEDS } from "@/lib/rss-feeds";
import type { RawArticle, SummaryResponse } from "@/lib/types";

const parser = new Parser({ timeout: 10000 });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function parseDate(dateStr: string | undefined): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

export async function GET(request: NextRequest) {
  const hoursParam = request.nextUrl.searchParams.get("hours");
  const hours = Math.min(48, Math.max(1, parseInt(hoursParam || "24", 10) || 24));
  const since = Date.now() - hours * 60 * 60 * 1000;

  const rawArticles: RawArticle[] = [];

  await Promise.all(
    RSS_FEEDS.map(async (feed) => {
      try {
        const feedXml = await fetch(feed.url, {
          headers: { "User-Agent": "NewsRead-RSS-Reader/1.0" },
          signal: AbortSignal.timeout(8000),
        }).then((r) => r.text());
        const parsed = await parser.parseString(feedXml);
        for (const item of parsed.items || []) {
          const pubDate = item.pubDate || item.isoDate;
          const ts = parseDate(pubDate);
          if (ts >= since) {
            rawArticles.push({
              title: item.title || "",
              link: item.link || "",
              pubDate: pubDate || new Date().toISOString(),
              content: item.content,
              contentSnippet: item.contentSnippet,
              source: feed.name,
            });
          }
        }
      } catch {
        // skip failed feeds
      }
    })
  );

  // sort by date desc
  rawArticles.sort((a, b) => parseDate(b.pubDate) - parseDate(a.pubDate));
  const toSend = rawArticles.slice(0, 80).map((a) => ({
    title: a.title,
    link: a.link,
    source: a.source,
    pubDate: a.pubDate || "",
    snippet: (a.contentSnippet || a.content || "").slice(0, 400),
  }));

  if (toSend.length === 0) {
    return Response.json({
      summary: "Aucun article trouvé pour la période sélectionnée.",
      articles: [],
      period: {
        from: new Date(since).toISOString(),
        to: new Date().toISOString(),
      },
    } satisfies SummaryResponse);
  }

  const systemPrompt = `Tu es un assistant qui analyse des titres et extraits d'articles de presse.
Ta tâche : identifier UNIQUEMENT les articles qui concernent le conflit ou les tensions entre d'une part USA/Israël et d'autre part l'Iran (ou acteurs liés : Hezbollah, Houthis, etc.).
Pour chaque article pertinent, fournis un très court résumé (1 phrase). À la fin, rédige un résumé global de 2 à 4 phrases sur l'actualité de ce conflit sur la période.
Réponds en JSON valide avec cette structure exacte :
{
  "relevant": [ { "index": 0, "snippet": "résumé une phrase" }, ... ],
  "globalSummary": "résumé global 2-4 phrases"
}
Les "index" correspondent à l'index (à partir de 0) des articles dans la liste fournie. Ne mets que les articles vraiment liés au conflit USA/Israël vs Iran.`;

  const userContent =
    "Liste des articles (index, title, source, snippet) :\n" +
    toSend
      .map(
        (a, i) =>
          `[${i}] ${a.title} | ${a.source} | ${(a.pubDate || "").slice(0, 10)} | ${a.snippet.slice(0, 200)}`
      )
      .join("\n");

  let summary = "Impossible de générer le résumé.";
  const relevantIndexes = new Map<number, string>();

  if (process.env.OPENAI_API_KEY) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      });
      const text = completion.choices[0]?.message?.content;
      if (text) {
        const parsed = JSON.parse(text) as {
          relevant?: Array<{ index: number; snippet: string }>;
          globalSummary?: string;
        };
        if (parsed.globalSummary) summary = parsed.globalSummary;
        for (const r of parsed.relevant || []) {
          relevantIndexes.set(r.index, r.snippet);
        }
      }
    } catch (e) {
      summary = "Erreur lors de l’appel à l’IA. Vérifiez OPENAI_API_KEY.";
    }
  } else {
    summary = "Configurez OPENAI_API_KEY pour activer le résumé par IA.";
  }

  const articles = toSend
    .map((a, i) =>
      relevantIndexes.has(i)
        ? {
            title: a.title,
            link: a.link,
            source: a.source,
            pubDate: a.pubDate,
            snippet: relevantIndexes.get(i) ?? a.snippet,
          }
        : null
    )
    .filter((a): a is NonNullable<typeof a> => a !== null);

  const response: SummaryResponse = {
    summary,
    articles,
    period: {
      from: new Date(since).toISOString(),
      to: new Date().toISOString(),
    },
  };

  return Response.json(response);
}
