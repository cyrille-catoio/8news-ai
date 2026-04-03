# spec-article-selection.md — Sélection des articles par qualité de score

> Version: 1.0 — Avril 2026
> Status: SPEC (not implemented)

---

## 1. Problème actuel

Quand un utilisateur sélectionne une période (ex: "7 jours") et qu'il y a plus de 200 articles sur cette période, l'onglet **"Tous les articles"** affiche les **200 plus récents** (tri `pub_date DESC`).

Conséquences :
- Sur 7 jours avec 1 500 articles, seuls les articles des dernières ~12h apparaissent.
- Des articles à score 9 ou 10 datant de 3 jours sont invisibles.
- L'utilisateur qui choisit "7 jours" veut voir **le meilleur de la semaine**, pas un flux chronologique. S'il voulait du récent, il choisirait "1h" ou "3h".

L'onglet **"Articles retenus"** (résumé IA) n'est pas concerné : il utilise `getScoredArticles` qui trie déjà par `relevance_score DESC`.

---

## 2. Analyse critique

### Ce qui fonctionne bien

| Composant | Tri | Verdict |
|-----------|-----|---------|
| Articles envoyés à l'IA (`getScoredArticles`) | `relevance_score DESC`, `pub_date DESC` | ✅ Correct — le résumé est basé sur les meilleurs articles |
| Score minimum dynamique (`getMinScore`) | 3 pour 1h → 7 pour 7d+ | ✅ Bon mécanisme — filtre plus strictement sur les longues périodes |

### Ce qui pose problème

| Composant | Tri actuel | Problème |
|-----------|-----------|----------|
| Onglet "Tous les articles" (`getAllArticlesFromDb`) | `pub_date DESC LIMIT 200` | ❌ Ignore le score, tronque les articles anciens mais pertinents |

### Risques d'un tri par score seul

1. **Articles non scorés** : `relevance_score IS NULL` → exclus du tri par score, donc invisibles.
2. **Biais temporel inverse** : les articles récents non encore scorés disparaissent au profit d'anciens scorés à 3/10.
3. **Clusters de redondance** : plusieurs articles sur le même événement avec des scores similaires pourraient dominer la liste.

---

## 3. Solution proposée

### Stratégie hybride : score + récence

Remplacer le tri unique `pub_date DESC` par un **tri à deux niveaux** :

1. **Tri principal** : `relevance_score DESC NULLS LAST` — les mieux scorés en premier, les non-scorés à la fin.
2. **Tri secondaire** : `pub_date DESC` — à score égal, les plus récents d'abord.

```sql
SELECT *
FROM articles
WHERE topic = $1
  AND pub_date >= $2
ORDER BY relevance_score DESC NULLS LAST,
         pub_date DESC
LIMIT 200
```

### Pourquoi cette approche

- Les articles à score 9-10 de toute la période apparaissent en premier.
- Les articles non scorés (`NULL`) apparaissent en fin de liste plutôt que d'être exclus.
- À score égal, la récence départage — un article à score 8 d'aujourd'hui passe avant un score 8 de 5 jours.
- Le `LIMIT 200` élimine naturellement les articles faiblement scorés (1-2) si le volume est élevé.

### Pourquoi pas un score pondéré par la date

On pourrait imaginer un score composite `relevance_score * decay(age)` pour favoriser les articles récents à score légèrement inférieur. Mais :
- Le score de pertinence (1-10) est déjà un jugement absolu de qualité — un article à 9/10 de 5 jours reste plus important qu'un 6/10 d'aujourd'hui.
- L'utilisateur contrôle la récence via le choix de période (1h, 3h, 24h, 7d...).
- La complexité ajoutée n'apporte pas de valeur claire.

**Verdict : tri simple `score DESC NULLS LAST, pub_date DESC` — robuste, lisible, correct.**

---

## 4. Impact sur `getScoredArticles`

La fonction `getScoredArticles` utilise déjà `relevance_score DESC, pub_date DESC`. Aucune modification nécessaire.

Cependant, le `minScore` appliqué par `getScoredArticles` augmente avec la durée (7 pour 7d+). Cela filtre les articles faibles avant envoi à l'IA, ce qui est correct et complémentaire.

---

## 5. Changement à implémenter

### Fichier : `src/lib/supabase.ts`

**Fonction `getAllArticlesFromDb`** — modifier le tri :

```typescript
// AVANT
.order("pub_date", { ascending: false })

// APRÈS
.order("relevance_score", { ascending: false, nullsFirst: false })
.order("pub_date", { ascending: false })
```

### Aucun autre fichier impacté

L'API `/api/news` et le frontend consomment déjà la liste telle quelle. Le changement est transparent.

---

## 6. Vérification

Après implémentation, vérifier sur une requête "7 jours" :
- Les premiers articles de l'onglet "Tous les articles" doivent avoir les scores les plus élevés.
- Les articles non scorés (`score: null`) doivent apparaître en fin de liste.
- Les articles des premiers jours de la période avec un score élevé doivent être visibles.

---

## 7. Résumé

| Avant | Après |
|-------|-------|
| 200 articles les plus récents | 200 articles les mieux scorés |
| Articles anciens pertinents invisibles | Articles anciens pertinents visibles |
| Non-scorés mélangés chronologiquement | Non-scorés regroupés en fin de liste |
| 1 ligne de code à changer | 1 ligne → 2 lignes |
