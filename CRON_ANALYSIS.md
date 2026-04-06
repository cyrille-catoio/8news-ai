# Analyse & optimisation des crons : cron-fetch et cron-score

## 1. Fonctionnement actuel

### Architecture générale

Deux fonctions Netlify Scheduled s'exécutent **chaque minute** :

| Cron | Rôle | Fichier |
|------|------|---------|
| `cron-fetch` | Récupère les articles RSS et les insère en base | `netlify/functions/cron-fetch.ts` |
| `cron-score` | Score les articles non scorés avec GPT-4.1-nano | `netlify/functions/cron-score.ts` |

Pas de queue ou de bus de messages : le couplage se fait **via les timestamps en base** (`last_fetched_at`, `last_scored_at`) et la colonne `relevance_score IS NULL`.

---

### cron-fetch — détail

**Contraintes d'exécution :**
- Deadline totale : **12 secondes** (`FETCH_DEADLINE_MS`)
- Réserve pour le mini-score post-fetch : 3,5 s (`POST_FETCH_SCORE_RESERVE_MS`)

**Sélection des topics à fetcher :**
```
k = min(max(1, ceil(N / 15)), 3)
```
Avec N = nombre de topics actifs. Objectif : parcourir tous les topics en ≤ 15 min.

| Nombre de topics | k (topics/min) | Cycle complet |
|-----------------|---------------|--------------|
| 8               | 1             | ~8 min       |
| 15              | 1             | ~15 min      |
| 30              | 2             | ~15 min      |
| 45+             | 3             | ~15 min      |

Priorité : topic avec le `last_fetched_at` le plus ancien (nulls en premier) → **round-robin équitable**.

**Pipeline par topic :**
1. Met à jour `last_fetched_at` immédiatement
2. Charge tous les feeds actifs (~20 feeds/topic)
3. Fetch RSS en parallèle (timeout 5 s par feed)
4. Upsert par batch de 100 articles (déduplication par `link`)
5. **Mini-score post-fetch** : si temps restant > 3,5 s, score jusqu'à **15 articles** du topic qui vient d'être fetché

**Résultat avec 8 topics :**
- Chaque topic est fetché toutes les ~8 minutes ✅ (< 15 min cible)
- 15 articles scorés immédiatement après fetch

---

### cron-score — détail

**Contraintes d'exécution :**
- Timeout Netlify : ~15 secondes
- 1 seul topic traité par invocation
- Max 50 articles par batch OpenAI

**Sélection du topic à scorer :**

1. **Priorité 1** — Topics avec backlog (articles non scorés dans les 7 derniers jours), triés par `last_fetched_at DESC` → les topics fraîchement fetchés passent en premier
2. **Priorité 2** — Topics sans backlog : mise à jour de `last_scored_at` uniquement, triés par `last_scored_at ASC`

**Scoring OpenAI :**
- Modèle : `gpt-4.1-nano`
- Timeout par batch : **6 secondes**
- Pour chaque article : score 1-10, raison, résumé EN + FR (si score ≥ 5)

---

## 2. Problèmes identifiés

### 2.1 Le mini-score post-fetch est trop limité (15 articles)

Le délai fetch → score est en théorie réduit à quelques secondes grâce au mini-score. Mais avec **15 articles max**, si un fetch insère 100-300 nouveaux articles, les 85-285 articles restants attendent le prochain passage de cron-score (1 à plusieurs minutes).

### 2.2 cron-score ne traite qu'1 topic par minute

Avec 8 topics et des backlogs variables, si plusieurs topics ont du backlog simultanément, chaque topic attend son tour. Exemple :

```
Minute 1 : score topic-A (50 articles)
Minute 2 : score topic-B (50 articles)
...
Minute 8 : score topic-H (50 articles)
Minute 9 : retour sur topic-A
```

→ Un article fetché sur topic-H peut attendre jusqu'à **7 minutes** avant d'être scoré (après le mini-score initial).

### 2.3 Pas d'adaptation du mini-score au volume fetché

Le mini-score est fixé à 15 articles quelle que soit la quantité fetchée. Un fetch qui insère 300 articles ne bénéficie pas d'un mini-score plus large alors que le temps disponible pourrait le permettre.

### 2.4 cron-score tourne à vide sur les topics sans backlog

Pour les topics sans article non scoré, cron-score dépense une invocation complète pour juste mettre à jour `last_scored_at`. C'est du temps machine gaspillé.

### 2.5 Risque d'accumulation si le feed rate dépasse 50 articles/min

Le scoring est plafonné à 50 articles/min/topic. Si les feeds d'un topic injectent plus vite, le backlog croît indéfiniment jusqu'à l'expiration de la fenêtre de 7 jours.

---

## 3. Propositions d'amélioration

### 3.1 Augmenter le mini-score post-fetch : 15 → 50 articles

**Modification** : dans `cron-fetch.ts`, passer `POST_FETCH_MAX_ARTICLES` de 15 à 50.

**Impact** :
- Score immédiat de 50 articles (au lieu de 15) dans la même invocation
- Temps estimé pour 50 articles avec GPT-4.1-nano : ~5-6 s (à l'intérieur du budget de 3,5 s restant → ajuster `POST_FETCH_SCORE_RESERVE_MS` à **6 000 ms**)
- Réduction drastique du backlog post-fetch pour les fetches de taille normale (<100 articles)

**Ajustement nécessaire :**
```typescript
// Avant
const POST_FETCH_SCORE_RESERVE_MS = 3_500;
const POST_FETCH_MAX_ARTICLES = 15;

// Après
const POST_FETCH_SCORE_RESERVE_MS = 6_000;
const POST_FETCH_MAX_ARTICLES = 50;
```

> ⚠️ La deadline totale est 12 s. Fetch RSS : ~5 s. Mini-score : ~6 s. Total : ~11 s → dans les limites.

---

### 3.2 Traiter plusieurs topics par invocation de cron-score (si backlog faible)

**Principe** : au lieu de scorer un seul topic et de sortir, continuer à scorer les topics suivants **tant qu'il reste du temps** (< 12 s) et que leur backlog est petit (≤ 20 articles → 1 seul appel OpenAI rapide).

**Logique proposée :**
```typescript
const SCORE_DEADLINE_MS = 12_000;
const MULTI_TOPIC_BACKLOG_THRESHOLD = 20; // articles

let deadline = Date.now() + SCORE_DEADLINE_MS;
let topicsProcessed = 0;

for (const topic of prioritizedTopics) {
  if (Date.now() >= deadline) break;
  if (topicsProcessed > 0 && topic.backlog > MULTI_TOPIC_BACKLOG_THRESHOLD) break; // seulement si backlog court
  await scoreAndStoreTopic(topic);
  topicsProcessed++;
}
```

**Impact** :
- Topics avec peu d'articles (cas fréquent en dehors des pics) : scorés en cascade dans une seule minute
- Topics avec gros backlog : comportement inchangé, 1 topic/invocation
- Réduction de la latence moyenne de plusieurs minutes à < 1 minute dans les cas courants

---

### 3.3 Skip rapide des topics sans backlog dans cron-score

**Modification** : avant de charger les articles, vérifier le count. Si 0 → mise à jour `last_scored_at` et `continue` immédiatement (sans appel OpenAI). C'est déjà partiellement fait, mais s'assurer que ces topics ne consomment pas l'invocation entière.

Le gain vient de la combinaison avec 3.2 : sauter rapidement les topics vides permet d'enchaîner vers les topics avec backlog.

---

### 3.4 Mini-score adaptatif selon le volume fetché

**Principe** : ajuster `maxArticles` du mini-score en fonction du nombre d'articles effectivement insérés.

```typescript
const inserted = fetchResult.inserted;
const miniScoreMax = Math.min(50, Math.max(15, inserted));
```

**Impact** : si un fetch n'insère que 5 articles, le mini-score ne perd pas de temps à chercher 50 articles. Si 80 articles insérés, il monte au maximum.

---

### 3.5 Réduire le cycle fetch à < 10 min (optionnel, si topics augmentent)

La formule actuelle garantit < 15 min. Pour se rapprocher des 10 min avec plus de topics :

```typescript
// Avant : ceil(N / 15)
// Après : ceil(N / 10)
k = min(max(1, ceil(N / 10)), 4)  // cap à 4 au lieu de 3
```

Avec 8 topics : toujours 1/min → cycle de 8 min (inchangé). Bénéfice si topics > 10.

---

## 4. Plan d'implémentation priorisé

| Priorité | Amélioration | Fichier | Impact | Risque |
|----------|-------------|---------|--------|--------|
| 🔴 1 | Mini-score 15 → 50 articles + ajuster `POST_FETCH_SCORE_RESERVE_MS` à 6 000 ms | `cron-fetch.ts` | Fort — articles scorés en quelques secondes | Faible — dans les limites de temps |
| 🔴 2 | Multi-topic scoring dans cron-score (si backlog ≤ 20) | `cron-score.ts` | Fort — latence chute à < 1 min cas courant | Moyen — surveiller le timeout Netlify |
| 🟡 3 | Mini-score adaptatif selon articles insérés | `cron-fetch.ts` / `shared/fetch-topic.ts` | Moyen — optimise la ressource | Faible |
| 🟢 4 | Ajuster formule k vers cycle ≤ 10 min | `cron-fetch.ts` | Faible (déjà < 15 min) | Nul |

---

## 5. Latences attendues après optimisation

| Scénario | Avant | Après |
|----------|-------|-------|
| Premiers 50 articles après fetch | ~3-7 min (attente cron-score) | **< 10 s** (mini-score post-fetch) |
| Articles 51-100 d'un fetch | ~5-10 min | **< 1 min** (multi-topic scoring) |
| Topic avec gros backlog (>200 articles) | Plusieurs minutes | **~1-4 min** (scoring 50/invocation, inchangé) |
| Cycle fetch complet (8 topics) | ~8 min | **~8 min** (inchangé, déjà < 15 min cible) |

---

## 6. Métriques à surveiller après déploiement

Via `/api/cron-stats` :
- `avgDelayMinutes` → doit baisser significativement (cible < 3 min)
- `coverage24h` → doit rester > 95 %
- `backlog` global → doit rester proche de 0 en dehors des pics
- Statuts topic : nombre de topics en `"slow"` ou `"high"` → doit tendre vers 0
