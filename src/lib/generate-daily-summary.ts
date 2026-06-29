import OpenAI from "openai";
import type { Lang } from "@/lib/i18n";
import type { ArticleSummary, SummaryBullet, AIAnalysis } from "@/lib/types";
import { formatArticleList, generateFallbackPrompt } from "@/lib/ai-analyze";
import { SNIPPET_MAX } from "@/lib/constants";
import {
  deleteDailySummaryById,
  getScoredArticles,
  getTopicPrompt,
  countArticlesForPeriod,
  getDailySummary,
  insertDailySummary,
  insertSummaryBullets,
} from "@/lib/supabase";
const MIN_SCORE = 3;
const MAX_ARTICLES_FEED = 50;
const MAX_ARTICLES_DISPLAY = 10;
const AI_MODEL = "gpt-4.1-mini";

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function sanitize(s: string): string {
  return s.replace(CONTROL_CHARS, " ").trim();
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toArticleSummary(
  r: {
    title: string;
    link: string;
    source: string;
    pub_date: string;
    snippet: string | null;
    content: string | null;
    snippet_ai_en?: string | null;
    snippet_ai_fr?: string | null;
  },
  lang: Lang,
): ArticleSummary {
  const aiSnippet = lang === "fr" ? r.snippet_ai_fr : r.snippet_ai_en;
  return {
    title: sanitize(r.title),
    link: r.link,
    source: sanitize(r.source),
    pubDate: r.pub_date,
    snippet: sanitize(aiSnippet || (r.snippet || r.content || "").slice(0, SNIPPET_MAX)),
  };
}

const SEO_PROMPT_ADDON_EN = `

IMPORTANT — This is a daily summary for a public SEO page. Quality matters:
- Write detailed, substantive bullet points (3-4 sentences each, not short headlines).
- Include specific numbers, percentages, dollar amounts, dates, and names.
- Add surprising facts, notable anecdotes, or unexpected details when available.
- Each bullet should read like a mini-paragraph that a reader finds genuinely informative.
- NEVER include article references, source names, or index numbers inside the bullet text (no parenthetical citations like "(Source)", "(Article 3)", "[TechCrunch]", etc.). References are handled separately via the "refs" array.
- Select only the 10 most important and diverse articles as "relevant".

Additionally, generate SEO metadata for this summary:
- "seoKeywords": exactly 3 distinctive lowercase words from the key events/entities (no filler like "news"/"update"/"recap"). Most important keyword first. These become the URL slug.
- "seoTitle": a compelling page title under 90 characters including the topic name and date. Do not truncate — use the full title
- "seoDescription": a meta description under 155 characters summarizing the key developments

For each bullet in globalSummary, also include:
- "entities": an array of 3-5 named entities mentioned in this bullet (company names, person names, product names, technical terms, specific events). Use the canonical/official name. No generic words.`;

const SEO_PROMPT_ADDON_FR = `

IMPORTANT — Ceci est un résumé quotidien pour une page SEO publique. La qualité compte :
- Rédige des bullet points détaillés et substantiels (3-4 phrases chacun, pas de simples titres).
- Inclus des chiffres précis, pourcentages, montants, dates et noms.
- Ajoute des faits surprenants, anecdotes notables ou détails inattendus quand c'est possible.
- Chaque bullet doit se lire comme un mini-paragraphe véritablement informatif.
- N'inclus JAMAIS de références aux articles, noms de sources ou numéros d'index dans le texte des bullet points (pas de citations entre parenthèses comme "(Source)", "(Article 3)", "[TechCrunch]", etc.). Les références sont gérées séparément via le tableau "refs".
- Ne sélectionne que les 10 articles les plus importants et variés comme "relevant".

De plus, génère des métadonnées SEO pour ce résumé :
- "seoKeywords" : exactement 3 mots distinctifs en minuscules issus des événements/entités clés (pas de mots vides comme "actualité"/"mise-à-jour"/"résumé"). Le mot le plus important en premier. Ces mots deviennent le slug URL.
- "seoTitle" : un titre de page accrocheur de moins de 90 caractères incluant le nom du topic et la date. Ne pas tronquer — utiliser le titre complet
- "seoDescription" : une méta-description de moins de 155 caractères résumant les développements clés

Pour chaque bullet dans globalSummary, inclus également :
- "entities" : un tableau de 3-5 entités nommées mentionnées dans ce bullet (noms d'entreprises, de personnes, de produits, termes techniques, événements spécifiques). Utilise le nom canonique/officiel. Pas de mots génériques.`;

export interface GenerateDailySummaryResult {
  summaryId: number;
  bulletCount: number;
  slug: string;
  seoTitle: string;
  articleCount: number;
}

export type GenerateStatus = "generated" | "skipped" | "no_articles" | "error";

export async function generateDailySummary(
  topicId: string,
  date: string,
  lang: Lang,
): Promise<(GenerateDailySummaryResult & { status: GenerateStatus }) | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const existing = await getDailySummary(topicId, date, lang);
  if (existing) {
    return {
      summaryId: existing.id,
      bulletCount: (Array.isArray(existing.bullets) ? existing.bullets : []).length,
      slug: existing.slug_keywords,
      seoTitle: existing.seo_title,
      articleCount: (Array.isArray(existing.articles) ? existing.articles : []).length,
      status: "skipped",
    };
  }

  const dayStart = new Date(`${date}T00:00:00Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);
  const sinceISO = dayStart.toISOString();

  const topicPrompt = await getTopicPrompt(topicId);
  if (!topicPrompt) return null;

  const untilISO = dayEnd.toISOString();

  const [scoredRows, counts] = await Promise.all([
    getScoredArticles(topicId, sinceISO, MIN_SCORE, MAX_ARTICLES_FEED, untilISO),
    countArticlesForPeriod(topicId, sinceISO, untilISO),
  ]);

  if (scoredRows.length === 0) {
    return { summaryId: 0, bulletCount: 0, slug: "", seoTitle: "", articleCount: 0, status: "no_articles" };
  }

  // Preserve `relevance_score` alongside the trimmed ArticleSummary so it
  // can be persisted in `daily_summaries.articles` and rendered as a
  // ScoreMeter on the SEO page. The base ArticleSummary type doesn't
  // expose score, but the runtime JSON keeps any extra field intact.
  const items = scoredRows.map((r) => ({
    ...toArticleSummary(r, lang),
    relevance_score: r.relevance_score ?? null,
  }));

  const promptTemplate = lang === "fr" ? topicPrompt.prompt_fr : topicPrompt.prompt_en;
  const basePrompt = promptTemplate
    ? promptTemplate.replace(/\{\{max\}\}/g, String(MAX_ARTICLES_DISPLAY))
    : generateFallbackPrompt(lang);
  const systemPrompt = sanitize(basePrompt + (lang === "fr" ? SEO_PROMPT_ADDON_FR : SEO_PROMPT_ADDON_EN));

  const userList = sanitize(
    lang === "fr"
      ? `Article list:\n${formatArticleList(items)}\n\nIMPORTANT — Réponds entièrement en français : pour chaque entrée du tableau "relevant", les champs "title" (titre traduit ou réécrit) et "snippet" (2–3 phrases factuelles) doivent être en français.`
      : `Article list:\n${formatArticleList(items)}`,
  );

  // Explicit timeout so a hung OpenAI request can't pin the background
  // function for the SDK's 10-min default. 240 s matches `ai-analyze.ts`,
  // the sibling article→summary generation.
  const openai = new OpenAI({ apiKey, timeout: 240_000 });
  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userList },
  ];

  let parsed: AIAnalysis | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages,
      response_format: { type: "json_object" },
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) continue;

    try {
      parsed = JSON.parse(rawContent) as AIAnalysis;
      break;
    } catch {
      if (attempt === 0) continue;
    }
  }

  if (!parsed) return null;

  // Build relevant map for article title/snippet overrides
  const relevant = new Map<number, { snippet: string; title?: string }>();
  for (const rv of parsed.relevant ?? []) {
    relevant.set(rv.index, { snippet: rv.snippet, title: rv.title });
  }

  // Process bullets with entities
  const bullets: SummaryBullet[] = [];
  type RawBullet = { text: string; refs?: number[]; entities?: string[] };
  const rawBulletArr: RawBullet[] = [];

  if (Array.isArray(parsed.globalSummary)) {
    const arr = parsed.globalSummary as RawBullet[];
    for (const blt of arr) {
      const text = (typeof blt === "string" ? blt : blt.text ?? "").replace(/^•\s*/, "").trim();
      if (!text) continue;
      const refs = (blt.refs ?? [])
        .filter((idx) => idx >= 0 && idx < items.length)
        .map((idx) => ({ title: items[idx].title, link: items[idx].link, source: items[idx].source }));
      bullets.push({ text, refs });
      rawBulletArr.push(blt);
    }
  }

  // Build filtered articles with AI overrides, limited to top 10
  const relevantIndices = [...relevant.keys()].sort((a, b) => a - b).slice(0, MAX_ARTICLES_DISPLAY);
  const filteredArticles: ArticleSummary[] = (
    relevantIndices.length > 0
      ? relevantIndices.map((i) => {
          const a = items[i];
          const entry = relevant.get(i);
          return { ...a, title: entry?.title || a.title, snippet: entry?.snippet || a.snippet };
        })
      : items.slice(0, MAX_ARTICLES_DISPLAY)
  );

  // SEO fields — AI may return a string, an array, or an object; normalize to string[]
  const rawKw: unknown = parsed.seoKeywords;
  const kwArr: string[] = Array.isArray(rawKw)
    ? (rawKw as unknown[]).map((w) => String(w))
    : typeof rawKw === "string"
      ? (rawKw as string).split(/[\s,\-]+/)
      : [];
  const seoKeywords = kwArr
    .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean)
    .slice(0, 3);
  const fallbackSlug = slugify(`${topicId}-${date.replace(/-/g, "")}`) || "summary";
  const slugFromKeywords = slugify(seoKeywords.join("-"));
  const slugKeywords = (slugFromKeywords || fallbackSlug).slice(0, 80) || fallbackSlug;
  const seoTitle = (typeof parsed.seoTitle === "string" ? parsed.seoTitle : `${topicId} — ${date}`).slice(0, 120);
  const seoDescription = (typeof parsed.seoDescription === "string" ? parsed.seoDescription : bullets.map((b) => b.text).join(". ").slice(0, 155)).slice(0, 160);

  const meta = {
    totalArticles: counts.total,
    scoredArticles: counts.scored,
    analyzedArticles: items.length,
  };

  const summaryId = await insertDailySummary({
    topic_id: topicId,
    summary_date: date,
    lang,
    slug_keywords: slugKeywords,
    bullets: bullets.map((b) => ({ text: b.text, refs: b.refs })),
    articles: filteredArticles,
    meta,
    seo_title: seoTitle,
    seo_description: seoDescription,
    seo_h1: seoTitle,
    period_from: dayStart.toISOString(),
    period_to: dayEnd.toISOString(),
  });

  if (!summaryId) return null;

  // v2.10.3+ — `source_type: 'daily_summary'` is passed explicitly
  // instead of relying on the DB default of `'article'`, which is a
  // legacy artifact from before migration 014 added the column. The
  // companion migration 032 backfills historical rows so every daily
  // summary bullet in the table now uses the same discriminator.
  const bulletRows = bullets.map((blt, i) => ({
    daily_summary_id: summaryId,
    topic_id: topicId,
    lang,
    summary_date: date,
    bullet_index: i,
    text: blt.text,
    refs: blt.refs,
    entities: (rawBulletArr[i]?.entities ?? []).map((e) => String(e).trim()).filter(Boolean),
    source_type: "daily_summary",
  }));

  const bulletsOk = await insertSummaryBullets(bulletRows);
  if (!bulletsOk) {
    console.error(
      `[generateDailySummary] insertSummaryBullets failed (topic=${topicId}, date=${date}, lang=${lang}, rows=${bulletRows.length})`,
    );
    const cleanupOk = await deleteDailySummaryById(summaryId);
    if (!cleanupOk) {
      console.error(
        `[generateDailySummary] cleanup failed for incomplete daily_summaries row id=${summaryId} (topic=${topicId}, date=${date}, lang=${lang})`,
      );
    }
    return {
      summaryId,
      bulletCount: bullets.length,
      slug: slugKeywords,
      seoTitle,
      articleCount: items.length,
      status: "error" as GenerateStatus,
    };
  }

  return { summaryId, bulletCount: bullets.length, slug: slugKeywords, seoTitle, articleCount: items.length, status: "generated" as GenerateStatus };
}
