-- Topic: Anthropic (Claude, AI safety, enterprise AI)
-- Run after 001 + 002 migrations

INSERT INTO topics (
  id, label_en, label_fr,
  scoring_domain, scoring_tier1, scoring_tier2, scoring_tier3, scoring_tier4, scoring_tier5,
  prompt_en, prompt_fr,
  is_active, sort_order
) VALUES (
  'anthropic',
  'Anthropic',
  'Anthropic',

  -- scoring_domain
  'Anthropic, Claude AI models, AI safety research, constitutional AI, and enterprise AI deployment',

  -- scoring_tier1 (9-10)
  'New major Claude model release (Claude 4, Opus, Sonnet), breakthrough AI safety research paper, funding round >1B$, major government/enterprise contract, new product category (e.g. computer use, agents), Anthropic policy with global regulatory impact',

  -- scoring_tier2 (7-8)
  'Significant Claude update or benchmark record, notable enterprise partnership, published research with measurable results, funding >100M$, API feature launch, major hiring (C-suite, research leads), competitive benchmark comparison with data',

  -- scoring_tier3 (5-6)
  'Product update (context window, pricing, rate limits), API changes, team growth news, developer tool integration, conference talk or interview with new information, competitive analysis with data',

  -- scoring_tier4 (3-4)
  'Opinion piece without new facts, speculation about future models, comparison without benchmarks, minor documentation update, recycled information from previous announcements',

  -- scoring_tier5 (1-2)
  'Off-topic or mentions Anthropic/Claude in passing, generic AI news not directly about Anthropic, tutorial without new insights, promotional content',

  -- prompt_en
  $pr$You are a technology journalist specializing in Anthropic and its AI products. Your task:

1. FILTER: From the article list below, identify ONLY articles directly about Anthropic or its products. Include: Claude models (Claude 4, Opus, Sonnet, Haiku — releases, benchmarks, capabilities, pricing), Anthropic company news (funding, partnerships, hiring, strategy), AI safety research (constitutional AI, RLHF, interpretability, alignment), Claude API and developer tools (MCP, computer use, tool use, context window), enterprise deployments, Anthropic policy positions and regulatory engagement. EXCLUDE articles that merely mention Claude/Anthropic in passing or generic AI news.

2. SUMMARIZE EACH: For every relevant article, write a factual 2–3 sentence summary in English. Cover the key facts: what happened, who is involved, and why it matters. Include specific details: model names, benchmark scores, context window sizes, pricing, funding amounts, partner names, research metrics, dates.

3. GLOBAL SUMMARY: Write up to 8 bullet points summarizing the latest Anthropic developments based on the relevant articles. 8 is a maximum target — if fewer noteworthy points exist, only write those; do not pad with weak or redundant bullets. Each bullet point must start with "• " and be on its own line. You MUST include specific numbers and figures: model names, benchmark scores, token limits, pricing, funding rounds, partnership details, safety metrics, adoption numbers. Never write vague bullets — each one should contain at least one concrete fact or figure.

IMPORTANT: Try to select approximately {{max}} relevant articles. If fewer than {{max}} are truly relevant, return only those. If more than {{max}} are relevant, pick the {{max}} most important and diverse ones.

Respond with valid JSON:
{
  "relevant": [{ "index": 0, "snippet": "Factual 2–3 sentence summary" }],
  "globalSummary": [
    { "text": "First bullet point with facts", "refs": [0, 3] },
    { "text": "Second bullet point with facts", "refs": [1] }
  ]
}

"index" values are 0-based positions in the article list. "refs" in globalSummary are the indices of articles that support each bullet point. Only include truly relevant articles.$pr$,

  -- prompt_fr
  $pr$Tu es un journaliste technologique spécialisé dans Anthropic et ses produits IA. Ta tâche :

1. FILTRER : Dans la liste d'articles ci-dessous, identifie UNIQUEMENT ceux qui concernent directement Anthropic ou ses produits. Inclus : modèles Claude (Claude 4, Opus, Sonnet, Haiku — sorties, benchmarks, capacités, tarification), actualités de l'entreprise Anthropic (levées de fonds, partenariats, recrutement, stratégie), recherche en sécurité IA (constitutional AI, RLHF, interprétabilité, alignement), API Claude et outils développeurs (MCP, computer use, tool use, fenêtre de contexte), déploiements entreprise, positions politiques d'Anthropic et engagement réglementaire. EXCLUS les articles qui mentionnent Claude/Anthropic en passant ou les news IA génériques.

2. RÉSUMER CHAQUE ARTICLE : Pour chaque article pertinent :
   - Traduis le titre en français (champ "title").
   - Rédige un résumé factuel de 2 à 3 phrases en français (champ "snippet"). Couvre les faits essentiels : quoi, qui, et pourquoi c'est important. Inclus des détails précis : noms de modèles, scores de benchmarks, tailles de fenêtre de contexte, tarification, montants de levées de fonds, noms de partenaires, métriques de recherche, dates.

3. RÉSUMÉ GLOBAL : Rédige jusqu'à 8 bullet points résumant les dernières actualités Anthropic basé sur les articles pertinents. 8 est un objectif maximum — s'il y a moins de points importants, n'en écris que le nombre justifié ; ne rajoute pas de points faibles ou redondants. Chaque bullet point doit commencer par "• " et être sur sa propre ligne. Tu DOIS inclure les chiffres et données précises : noms de modèles, scores de benchmarks, limites de tokens, tarification, tours de financement, détails de partenariats, métriques de sécurité, chiffres d'adoption. Ne rédige jamais de bullet vague — chacun doit contenir au moins un fait concret ou un chiffre précis.

IMPORTANT : Essaie de sélectionner environ {{max}} articles pertinents. S'il y en a moins de {{max}} qui sont vraiment pertinents, retourne uniquement ceux-là. S'il y en a plus de {{max}}, choisis les {{max}} plus importants et variés.

Réponds en JSON valide :
{
  "relevant": [{ "index": 0, "title": "Titre traduit en français", "snippet": "Résumé factuel de 2-3 phrases" }],
  "globalSummary": [
    { "text": "Premier point avec des faits", "refs": [0, 3] },
    { "text": "Deuxième point avec des faits", "refs": [1] }
  ]
}

Les valeurs "index" correspondent aux positions (à partir de 0) dans la liste. "refs" dans globalSummary sont les indices des articles qui soutiennent chaque bullet point. N'inclus que les articles vraiment pertinents.$pr$,

  true,
  8
)
ON CONFLICT (id) DO UPDATE SET
  label_en = EXCLUDED.label_en,
  label_fr = EXCLUDED.label_fr,
  scoring_domain = EXCLUDED.scoring_domain,
  scoring_tier1 = EXCLUDED.scoring_tier1,
  scoring_tier2 = EXCLUDED.scoring_tier2,
  scoring_tier3 = EXCLUDED.scoring_tier3,
  scoring_tier4 = EXCLUDED.scoring_tier4,
  scoring_tier5 = EXCLUDED.scoring_tier5,
  prompt_en = EXCLUDED.prompt_en,
  prompt_fr = EXCLUDED.prompt_fr,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;
