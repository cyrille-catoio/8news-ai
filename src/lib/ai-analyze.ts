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
    return `Tu es un analyste de presse. Résume TOUS les articles fournis. Pour chaque article, écris un résumé factuel de 2-3 phrases. Produis jusqu'à 8 bullet points factuels couvrant les sujets majeurs. N'inclus JAMAIS de références aux articles ou noms de sources dans le texte des bullet points — les références sont gérées via le tableau "refs". Réponds en JSON: {"relevant":[{"index":0,"snippet":"..."}],"globalSummary":[{"text":"...","refs":[0]}]}`;
  }
  return `You are a news analyst. Summarize ALL articles provided. For each article, write a factual 2-3 sentence summary. Write up to 8 factual bullet points covering the major topics. NEVER include article references or source names inside bullet text — references are handled via the "refs" array. Respond with JSON: {"relevant":[{"index":0,"snippet":"..."}],"globalSummary":[{"text":"...","refs":[0]}]}`;
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
  model: string = "gpt-4.1-mini",
): Promise<{ summary: string; bullets: SummaryBullet[]; relevant: Map<number, RelevantEntry> }> {
  const msg = getServerMessages(lang);
  const openai = new OpenAI({ apiKey });

  const userList =
    lang === "fr"
      ? `Article list:\n${formatArticleList(items)}\n\nIMPORTANT — Réponds entièrement en français : pour chaque entrée du tableau "relevant", les champs "title" (titre traduit ou réécrit) et "snippet" (2–3 phrases factuelles) doivent être en français.`
      : `Article list:\n${formatArticleList(items)}`;

  // Two-attempt parse: even with `response_format: json_object`, OpenAI
  // can occasionally return malformed JSON (especially on long, complex
  // schemas like the grouped Top articles prompt). Retrying once with
  // the same input is cheap and reliably recovers the call instead of
  // letting the caller (cron / API route) fall through to its error
  // branch and lose a whole lang's snapshot.
  const callOnce = () =>
    openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userList },
      ],
      response_format: { type: "json_object" },
    });

  let parsed: AIAnalysis | null = null;
  let lastRawForLog: string = "";
  let lastErrMsg: string = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const completion = await callOnce();
      const raw = completion.choices[0]?.message?.content ?? "";
      lastRawForLog = raw;
      if (!raw) {
        lastErrMsg = "empty response";
        continue;
      }
      parsed = JSON.parse(raw) as AIAnalysis;
      break;
    } catch (err) {
      lastErrMsg = err instanceof Error ? err.message : "unknown";
      if (attempt === 1) {
        const sample = lastRawForLog.slice(0, 400).replace(/\s+/g, " ").trim();
        console.error(
          `[analyzeWithAI] JSON parse failed after 2 attempts (lang=${lang}, model=${model}): ${lastErrMsg} | raw[0..400]="${sample}"`,
        );
      }
    }
  }

  if (!parsed) return { summary: msg.fallback, bullets: [], relevant: new Map() };
  const relevant = new Map<number, RelevantEntry>();
  for (const r of parsed.relevant ?? []) {
    relevant.set(r.index, { snippet: r.snippet, title: r.title });
  }

  let summaryText: string;
  let bullets: SummaryBullet[] = [];

  if (Array.isArray(parsed.globalSummary)) {
    type FlatBullet = { text?: string; refs?: number[]; title?: string; importance?: number };
    type GroupedBullet = {
      title?: string;
      /**
       * Editorial importance 1-10 for the whole group (Top 24h prompt
       * v2.6.9+). Propagated below to every flattened sub-bullet so the
       * persistence layer keeps its flat-row shape and the UI can read
       * the score off the first bullet of each visible group. The LLM
       * is asked to ground the score on industry impact (see prompt in
       * `generate-top-summary.ts`). Anything outside 1-10 is dropped to
       * null at flatten time.
       */
      importance?: number;
      bullets?: Array<{ text?: string; refs?: number[] }>;
    };
    type RawEntry = string | FlatBullet | GroupedBullet;
    const arr = parsed.globalSummary as RawEntry[];

    const cleanTitle = (raw: unknown): string =>
      String(raw ?? "")
        .replace(/^\s*["“«]+|["”»]+\s*$/g, "")
        .replace(/[\.…]+\s*$/u, "")
        .trim();

    const clampImportance = (raw: unknown): number | null => {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
      const rounded = Math.round(raw);
      if (rounded < 1 || rounded > 10) return null;
      return rounded;
    };

    const buildRefs = (refs: number[] | undefined) =>
      (refs ?? [])
        .filter((idx) => idx >= 0 && idx < items.length)
        .map((idx) => ({
          title: items[idx].title,
          link: items[idx].link,
          source: items[idx].source,
        }));

    // Two shapes accepted:
    //  - Grouped (Top articles since v2.6.6): { title, importance?, bullets:[{text,refs}] }.
    //    The same `title` AND `importance` are propagated to every flattened
    //    bullet so the DB stays in the existing flat `summary_bullets`
    //    shape and the UI can render them under a shared heading + meter.
    //  - Flat (legacy + simple callers): { title?, text, refs } — each
    //    entry is a 1-bullet group on its own; `importance` may also be
    //    present at the leaf level for completeness.
    for (const entry of arr) {
      if (entry && typeof entry === "object" && Array.isArray((entry as GroupedBullet).bullets)) {
        const group = entry as GroupedBullet;
        const groupTitle = cleanTitle(group.title);
        const groupImportance = clampImportance(group.importance);
        for (const sub of group.bullets ?? []) {
          const text = String(sub?.text ?? "").replace(/^•\s*/, "").trim();
          if (!text) continue;
          bullets.push({
            text,
            refs: buildRefs(sub?.refs),
            title: groupTitle.length > 0 ? groupTitle : null,
            importance: groupImportance,
          });
        }
        continue;
      }
      const flat = entry as FlatBullet | string;
      const flatTitle = typeof flat === "string" ? "" : cleanTitle(flat.title);
      const flatText = (typeof flat === "string" ? flat : flat.text ?? "").replace(/^•\s*/, "").trim();
      const flatImportance = typeof flat === "string" ? null : clampImportance(flat.importance);
      if (!flatText) continue;
      bullets.push({
        text: flatText,
        refs: buildRefs(typeof flat === "string" ? undefined : flat.refs),
        title: flatTitle.length > 0 ? flatTitle : null,
        importance: flatImportance,
      });
    }

    // Render as grouped markdown: the title prints once at the top of
    // each group, then `•` lines for every bullet that shares it.
    // Untitled bullets keep the previous bullet-only layout — that path
    // is what every non-Top-articles caller still uses, so layout stays
    // unchanged for them.
    const lines: string[] = [];
    let prevTitle: string | null = null;
    let firstGroup = true;
    for (const b of bullets) {
      const t: string | null = b.title ?? null;
      if (t !== prevTitle) {
        if (!firstGroup) lines.push("");
        if (t) lines.push(`**${t}**`);
        prevTitle = t;
        firstGroup = false;
      }
      lines.push(`• ${b.text}`);
    }
    summaryText = lines.join("\n");
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
