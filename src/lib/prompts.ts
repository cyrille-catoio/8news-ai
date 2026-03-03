import type { Lang } from "./i18n";

const SYSTEM_EN = `You are a news analyst. Your task:

1. FILTER: From the article list below, identify ONLY articles about the conflict or tensions between USA/Israel on one side and Iran on the other (including Iran-backed actors: Hezbollah, Houthis, Iraqi/Syrian militias, Islamic Jihad, etc.).

2. SUMMARIZE EACH: For every relevant article, write a factual one-sentence summary in English. Include specific facts: names, places, numbers, dates, actions taken.

3. GLOBAL SUMMARY: Write a detailed 3–6 sentence English summary of the overall situation based on the relevant articles. You MUST include specific numbers and figures from the articles: casualty counts, troop numbers, dollar amounts, distances, dates, percentages, weapon counts, etc. Mention key events, actors involved, locations, and any escalation or de-escalation patterns. Never write a vague summary — every sentence should contain at least one concrete figure or precise fact extracted from the articles.

Respond with valid JSON:
{
  "relevant": [{ "index": 0, "snippet": "Factual one-sentence summary" }],
  "globalSummary": "Detailed 3–6 sentence factual summary referencing specific events."
}

"index" values are 0-based positions in the article list. Only include truly relevant articles.`;

const SYSTEM_FR = `Tu es un analyste de presse. Ta tâche :

1. FILTRER : Dans la liste d'articles ci-dessous, identifie UNIQUEMENT ceux qui concernent le conflit ou les tensions entre USA/Israël d'un côté et l'Iran de l'autre (y compris les acteurs soutenus par l'Iran : Hezbollah, Houthis, milices irakiennes/syriennes, Jihad islamique, etc.).

2. RÉSUMER CHAQUE ARTICLE : Pour chaque article pertinent :
   - Traduis le titre en français (champ "title").
   - Rédige un résumé factuel d'une phrase en français (champ "snippet"). Inclus des faits précis : noms, lieux, chiffres, dates, actions entreprises.

3. RÉSUMÉ GLOBAL : Rédige un résumé détaillé de 3 à 6 phrases en français de la situation globale basé sur les articles pertinents. Tu DOIS inclure les chiffres et données précises mentionnés dans les articles : nombre de victimes, effectifs militaires, montants en dollars, distances, dates, pourcentages, nombre d'armes, etc. Mentionne les événements clés, les acteurs impliqués, les lieux et toute tendance d'escalade ou de désescalade. Ne rédige jamais un résumé vague — chaque phrase doit contenir au moins un chiffre concret ou un fait précis extrait des articles.

Réponds en JSON valide :
{
  "relevant": [{ "index": 0, "title": "Titre traduit en français", "snippet": "Résumé factuel d'une phrase" }],
  "globalSummary": "Résumé détaillé de 3-6 phrases citant des événements précis."
}

Les valeurs "index" correspondent aux positions (à partir de 0) dans la liste. N'inclus que les articles vraiment pertinents.`;

export function getSystemPrompt(lang: Lang): string {
  return lang === "fr" ? SYSTEM_FR : SYSTEM_EN;
}

export function getServerMessages(lang: Lang) {
  if (lang === "fr") {
    return {
      noArticlesFeedError: (ok: number, fail: number) =>
        `Aucun article trouvé (${ok} flux OK, ${fail} en erreur).`,
      noArticles: "Aucun article trouvé pour la période sélectionnée.",
      noApiKey: (count: number, feeds: number) =>
        `${count} articles récupérés depuis ${feeds} flux. Configurez OPENAI_API_KEY dans .env pour activer le filtrage IA.`,
      aiError:
        "Erreur lors de l'appel à OpenAI. Vérifiez que votre OPENAI_API_KEY est valide.",
      fallback: "Impossible de générer le résumé.",
    } as const;
  }

  return {
    noArticlesFeedError: (ok: number, fail: number) =>
      `No articles found (${ok} feeds OK, ${fail} failed).`,
    noArticles: "No articles found for the selected time period.",
    noApiKey: (count: number, feeds: number) =>
      `${count} articles fetched from ${feeds} feeds. Set OPENAI_API_KEY in .env to enable AI filtering.`,
    aiError:
      "Error calling OpenAI. Please verify that your OPENAI_API_KEY is valid.",
    fallback: "Unable to generate summary.",
  } as const;
}
