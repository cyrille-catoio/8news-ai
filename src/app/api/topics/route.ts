import { NextRequest, NextResponse } from "next/server";
import {
  getActiveTopics,
  createTopic,
} from "@/lib/supabase";
import type { TopicItem } from "@/lib/types";
import { requireOwnerSession } from "@/lib/auth-api";

export async function GET(req: NextRequest) {
  try {
    const includeAll = req.nextUrl.searchParams.get("all") === "1";
    if (includeAll) {
      const auth = await requireOwnerSession();
      if (!auth.ok) return auth.response;
    }
    const rows = await getActiveTopics(includeAll);

    const topics: TopicItem[] = rows.map((r) => ({
      id: r.id,
      labelEn: r.label_en,
      labelFr: r.label_fr,
      feedCount: r.feed_count,
      isActive: r.is_active,
      isDisplayed: r.is_displayed ?? true,
      sortOrder: r.sort_order,
    }));

    return NextResponse.json(topics, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch topics" },
      { status: 500 },
    );
  }
}

function generateDefaultPromptEn(label: string, domain: string): string {
  return `You are a news analyst specializing in ${domain}. Your task:

1. FILTER: From the article list below, identify ONLY articles about ${label.toLowerCase()}. Exclude unrelated news.

2. SUMMARIZE EACH: For every relevant article, write a factual 2–3 sentence summary in English. Cover the key facts: who, what, where, when, and why. Include specific details: names, numbers, dates.

3. GLOBAL SUMMARY: Write up to 8 bullet points summarizing the latest developments based on the relevant articles. 8 is a maximum target — if fewer noteworthy points exist, only write those. Each bullet point must start with "• " and be on its own line. Include specific numbers and figures. Never write vague bullets.

IMPORTANT: Try to select approximately {{max}} relevant articles. If fewer are truly relevant, return only those. If more are relevant, pick the {{max}} most important and diverse ones.

Respond with valid JSON:
{
  "relevant": [{ "index": 0, "snippet": "Factual 2–3 sentence summary" }],
  "globalSummary": [
    { "text": "First bullet point with facts", "refs": [0, 3] },
    { "text": "Second bullet point with facts", "refs": [1] }
  ]
}

"index" values are 0-based positions in the article list. "refs" in globalSummary are the indices of articles that support each bullet point. Only include truly relevant articles.`;
}

function generateDefaultPromptFr(label: string, domain: string): string {
  return `Tu es un analyste de presse spécialisé en ${domain}. Ta tâche :

1. FILTRER : Dans la liste d'articles ci-dessous, identifie UNIQUEMENT ceux qui concernent ${label.toLowerCase()}. Exclus les news non liées.

2. RÉSUMER CHAQUE ARTICLE : Pour chaque article pertinent :
   - Traduis le titre en français (champ "title").
   - Rédige un résumé factuel de 2 à 3 phrases en français (champ "snippet"). Couvre les faits essentiels : qui, quoi, où, quand, pourquoi. Inclus des détails précis : noms, chiffres, dates.

3. RÉSUMÉ GLOBAL : Rédige jusqu'à 8 bullet points résumant les dernières actualités basé sur les articles pertinents. 8 est un objectif maximum — s'il y a moins de points importants, n'en écris que le nombre justifié. Chaque bullet point doit commencer par "• " et être sur sa propre ligne. Inclus les chiffres et données précises. Ne rédige jamais de bullet vague.

IMPORTANT : Essaie de sélectionner environ {{max}} articles pertinents. S'il y en a moins de {{max}} qui sont vraiment pertinents, retourne uniquement ceux-là. S'il y en a plus de {{max}}, choisis les {{max}} plus importants et variés.

Réponds en JSON valide :
{
  "relevant": [{ "index": 0, "title": "Titre traduit en français", "snippet": "Résumé factuel de 2-3 phrases" }],
  "globalSummary": [
    { "text": "Premier point avec des faits", "refs": [0, 3] },
    { "text": "Deuxième point avec des faits", "refs": [1] }
  ]
}

Les valeurs "index" correspondent aux positions (à partir de 0) dans la liste. "refs" dans globalSummary sont les indices des articles qui soutiennent chaque bullet point. N'inclus que les articles vraiment pertinents.`;
}

const SLUG_RE = /^[a-z0-9-]{2,30}$/;

export async function POST(req: NextRequest) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    const {
      id,
      labelEn,
      labelFr,
      scoringDomain,
      scoringTier1,
      scoringTier2,
      scoringTier3,
      scoringTier4,
      scoringTier5,
    } = body;

    if (!id || !SLUG_RE.test(id)) {
      return NextResponse.json(
        { error: "id must be 2-30 lowercase alphanumeric chars or hyphens" },
        { status: 400 },
      );
    }

    for (const [key, val] of Object.entries({
      labelEn,
      labelFr,
    })) {
      if (!val || typeof val !== "string" || val.length > 50) {
        return NextResponse.json(
          { error: `${key} must be 1-50 characters` },
          { status: 400 },
        );
      }
    }

    for (const [key, val] of Object.entries({
      scoringDomain,
      scoringTier1,
      scoringTier2,
      scoringTier3,
      scoringTier4,
      scoringTier5,
    })) {
      if (!val || typeof val !== "string" || val.length > 500) {
        return NextResponse.json(
          { error: `${key} must be 1-500 characters` },
          { status: 400 },
        );
      }
    }

    const existingTopics = await getActiveTopics();
    const maxSort = existingTopics.reduce(
      (m, t) => Math.max(m, t.sort_order),
      -1,
    );

    const promptEn = typeof body.promptEn === "string" ? body.promptEn : "";
    const promptFr = typeof body.promptFr === "string" ? body.promptFr : "";

    if (promptEn.length > 5000 || promptFr.length > 5000) {
      return NextResponse.json(
        { error: "Prompt must be 5000 characters or less" },
        { status: 400 },
      );
    }

    const finalPromptEn = promptEn || generateDefaultPromptEn(labelEn, scoringDomain);
    const finalPromptFr = promptFr || generateDefaultPromptFr(labelFr, scoringDomain);

    const row = await createTopic({
      id,
      label_en: labelEn,
      label_fr: labelFr,
      scoring_domain: scoringDomain,
      scoring_tier1: scoringTier1,
      scoring_tier2: scoringTier2,
      scoring_tier3: scoringTier3,
      scoring_tier4: scoringTier4,
      scoring_tier5: scoringTier5,
      prompt_en: finalPromptEn,
      prompt_fr: finalPromptFr,
      sort_order: maxSort + 1,
    });

    if (!row) {
      return NextResponse.json(
        { error: "Topic already exists or creation failed" },
        { status: 409 },
      );
    }

    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create topic" },
      { status: 500 },
    );
  }
}
