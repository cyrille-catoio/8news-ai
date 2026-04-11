import OpenAI from "openai";
import type { Lang } from "@/lib/i18n";
import type { ArticleSummary, SummaryBullet, AIAnalysis } from "@/lib/types";

export function getServerMessages(lang: Lang) {
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

export function generateFallbackPrompt(lang: Lang): string {
  if (lang === "fr") {
    return `Tu es un analyste de presse. Résume TOUS les articles fournis. Pour chaque article, écris un résumé factuel de 2-3 phrases. Produis jusqu'à 8 bullet points factuels couvrant les sujets majeurs. Réponds en JSON: {"relevant":[{"index":0,"snippet":"..."}],"globalSummary":[{"text":"...","refs":[0]}]}`;
  }
  return `You are a news analyst. Summarize ALL articles provided. For each article, write a factual 2-3 sentence summary. Write up to 8 factual bullet points covering the major topics. Respond with JSON: {"relevant":[{"index":0,"snippet":"..."}],"globalSummary":[{"text":"...","refs":[0]}]}`;
}

export function formatArticleList(items: ArticleSummary[]): string {
  return items
    .map((a, i) =>
      `[${i}] ${a.title} | ${a.source} | ${a.pubDate.slice(0, 10)} | ${a.snippet.slice(0, 300)}`
    )
    .join("\n");
}

export interface RelevantEntry {
  snippet: string;
  title?: string;
}

export async function analyzeWithAI(
  items: ArticleSummary[],
  systemPrompt: string,
  lang: Lang,
  apiKey: string,
  model: string = "gpt-4.1-nano",
): Promise<{ summary: string; bullets: SummaryBullet[]; relevant: Map<number, RelevantEntry> }> {
  const msg = getServerMessages(lang);
  const openai = new OpenAI({ apiKey });

  const userList =
    lang === "fr"
      ? `Article list:\n${formatArticleList(items)}\n\nIMPORTANT — Réponds entièrement en français : pour chaque entrée du tableau "relevant", les champs "title" (titre traduit ou réécrit) et "snippet" (2–3 phrases factuelles) doivent être en français.`
      : `Article list:\n${formatArticleList(items)}`;

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userList },
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
