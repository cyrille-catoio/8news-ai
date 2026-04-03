# spec-max-articles.md — Suppression du multiplicateur x2 et clarification du flux

> Version: 1.0 — Avril 2026
> Status: SPEC (not implemented)

---

## 1. Problème

Le paramètre **"Max relevant articles"** (configurable dans Settings) est trompeur :

| Ce que l'utilisateur pense | Ce qui se passe réellement |
|---------------------------|---------------------------|
| "Je veux 10 articles" | 20 articles sont récupérés de la BDD |
| "L'IA me montre les 10 meilleurs" | L'IA re-filtre 20 articles déjà filtrés par score |
| "Je verrai 10 articles retenus" | L'IA en retourne 7, 8 ou 12 — imprévisible |

### Pourquoi le x2 est inutile

Le système possède déjà un **double filtrage en amont** :

1. **Pré-scoring** (`cron-score`) : chaque article reçoit un score 1-10 par GPT-4.1-nano.
2. **Score minimum dynamique** (`getMinScore`) : seuls les articles au-dessus d'un seuil (3 pour 1h → 7 pour 7d+) sont récupérés.
3. **Tri par score DESC** : `getScoredArticles` retourne les N meilleurs, déjà ordonnés.

Demander à l'IA de "choisir 10 parmi 20 articles déjà triés par score" revient à lui demander de refaire un travail déjà effectué, avec un résultat imprévisible et un coût en tokens doublé.

---

## 2. Solution

### Principe : l'IA résume, la BDD filtre

- La **BDD** fournit exactement `maxArticles` articles (les mieux scorés, au-dessus du `minScore`).
- L'**IA** résume **tous** les articles reçus et génère les bullet points.
- L'utilisateur reçoit exactement le nombre d'articles qu'il a configuré.

### Changements

#### 2.1 `src/app/api/news/route.ts`

**Ligne 191** — Supprimer le `* 2` :

```typescript
// AVANT
getScoredArticles(topic, sinceISO, minScore, maxArticles * 2),

// APRÈS
getScoredArticles(topic, sinceISO, minScore, maxArticles),
```

**Lignes 233-243** — Ne plus filtrer par `relevant.get(i)`, garder tous les articles et enrichir avec le snippet IA quand disponible :

```typescript
// AVANT
const filteredArticles: ArticleSummary[] = items
  .map((a, i) => {
    const entry = relevant.get(i);
    if (!entry) return null;
    return { ...a, title: entry.title || a.title, snippet: entry.snippet };
  })
  .filter((a): a is ArticleSummary => a !== null);

// APRÈS
const filteredArticles: ArticleSummary[] = items.map((a, i) => {
  const entry = relevant.get(i);
  return {
    ...a,
    title: entry?.title || a.title,
    snippet: entry?.snippet || a.snippet,
  };
});
```

#### 2.2 Prompt — Changer "Identifie les N plus pertinents" → "Résume tous les articles"

**`generateFallbackPrompt`** :

```typescript
// AVANT
`You are a news analyst. Identify the ${maxArticles} most relevant articles.
 Summarize each in 2-3 sentences. ...`

// APRÈS
`You are a news analyst. Summarize ALL articles provided.
 For each article, write a 2-3 sentence summary. ...`
```

Le prompt demande maintenant de résumer **tous** les articles, pas d'en sélectionner un sous-ensemble. Le JSON de réponse reste identique : `{"relevant":[{"index":0,"snippet":"..."}], "globalSummary":[...]}`.

**Note** : les prompts personnalisés par topic (stockés en BDD) utilisent `{{max}}`. Ce placeholder reste disponible mais son usage change : il indique le nombre total d'articles fournis, pas un nombre à sélectionner. Les prompts existants qui disent "sélectionne {{max}} articles" devront être mis à jour pour dire "résume les articles fournis".

#### 2.3 `src/lib/i18n.ts`

Mettre à jour le texte d'aide de `maxArticlesInfo` pour refléter le nouveau comportement :

```typescript
maxArticlesInfo: {
  en: "The top-scored articles from the selected period are sent to the AI for summary. This setting controls how many articles are analyzed.",
  fr: "Les articles les mieux scorés de la période sont envoyés à l'IA pour résumé. Ce réglage contrôle combien d'articles sont analysés.",
},
```

---

## 3. Impact qualité

| Aspect | Avant (x2) | Après (x1) |
|--------|-----------|------------|
| Articles envoyés à l'IA | 20 | 10 |
| Articles affichés | 7-12 (imprévisible) | 10 (exact) |
| Coût tokens | ~2x | ~1x |
| Qualité résumé | Bonne (IA choisit parmi 20) | Équivalente (les 10 meilleurs sont déjà pré-scorés) |
| Latence | Plus lente (plus de tokens) | Plus rapide |
| Clarté UX | "Pourquoi 8 au lieu de 10 ?" | "10 demandés, 10 affichés" |

La qualité reste maximale car le pré-scoring + minScore + tri DESC garantissent que les N articles envoyés à l'IA sont déjà les meilleurs de la période.

---

## 4. Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `src/app/api/news/route.ts` | Supprimer `* 2`, modifier le filtrage, mettre à jour le fallback prompt |
| `src/lib/i18n.ts` | Mettre à jour `maxArticlesInfo` |

---

## 5. Prompts personnalisés en BDD

Les prompts stockés dans `topics.prompt_en` / `topics.prompt_fr` qui contiennent des instructions du type "select the {{max}} most relevant" devront être revus pour dire "summarize all articles provided". Ce n'est pas bloquant : le système fonctionne avec les anciens prompts (l'IA fera de son mieux), mais les résultats seront plus cohérents après mise à jour.

**Recommandation** : ajouter un TODO pour passer en revue les prompts existants après déploiement.
