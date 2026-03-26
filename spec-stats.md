# 8news.ai — Stats Page Specification

**Version**: v1.0
**Last updated**: March 2026

---

## 1. Objectif

La page **Stats** a pour vocation première de **scorer la qualité des flux RSS** afin d'identifier les sources les plus pertinentes par topic. Elle offre également une vue d'ensemble sur la santé de la base de données, l'activité du scoring, et les tendances temporelles.

---

## 2. Source de données

Toutes les données proviennent de la table Supabase `articles` :

| Colonne | Type | Usage Stats |
|---|---|---|
| `id` | int | Comptage total |
| `topic` | string | Regroupement par topic |
| `source` | string | Regroupement par flux RSS |
| `pub_date` | timestamp | Analyse temporelle |
| `relevance_score` | int (1-10) \| null | Distribution des scores |
| `scored_at` | timestamp \| null | Activité de scoring |
| `score_reason` | string \| null | Analyse qualitative |
| `snippet_ai_en` | string \| null | Présence de résumé AI |
| `snippet_ai_fr` | string \| null | Présence de résumé AI |

**API endpoint** : `GET /api/stats` (à créer) — renvoie toutes les statistiques agrégées en un seul appel.

---

## 3. Architecture de la page

```
┌──────────────────────────────────────────────────────┐
│  HEADER (shared) : Logo · Lang · 🏠 · 📊 · ⚙️       │
├──────────────────────────────────────────────────────┤
│  Stats                                               │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─── GLOBAL KPIs (4 cards en ligne) ──────────────┐ │
│  │ Total articles │ Scorés │ % scorés │ Score moy. │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─── ACTIVITY KPIs (3 cards en ligne) ────────────┐ │
│  │ Articles 24h │ Articles 7j │ Scorés 24h         │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─── TOPIC SELECTOR (tab bar) ────────────────────┐ │
│  │ All │ Iran War │ AI │ AI Eng │ ... │ Elon       │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─── SCORE DISTRIBUTION (pour le topic sélect.) ──┐ │
│  │ Bar chart horizontal : % par fourchette de score│ │
│  │ 9-10 ████████ 12%                               │ │
│  │ 7-8  ██████████████ 23%                         │ │
│  │ 5-6  ████████████████████ 31%                   │ │
│  │ 3-4  ██████████████ 22%                         │ │
│  │ 1-2  ████████ 12%                               │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─── FEED RANKING TABLE ──────────────────────────┐ │
│  │ # │ Source       │ Total │ Avg │ Hit% │ 9-10 │..│ │
│  │ 1 │ TechCrunch   │  342  │ 6.8 │ 41%  │ 14%  │  │ │
│  │ 2 │ The Verge    │  289  │ 6.2 │ 35%  │ 10%  │  │ │
│  │ ...                                              │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─── TOP 10 ARTICLES (score le plus haut) ────────┐ │
│  │ Score │ Source │ Title │ Date                    │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## 4. Section 1 — Global KPIs (Header Dashboard)

Quatre **cards KPI** en ligne, style identique aux `sectionStyle` existants.

### 4.1 Total articles

- **Requête** : `SELECT COUNT(*) FROM articles`
- **Affichage** : Nombre formaté (ex: `12,847`)
- **Label** : "Total articles"

### 4.2 Articles scorés

- **Requête** : `SELECT COUNT(*) FROM articles WHERE relevance_score IS NOT NULL`
- **Affichage** : Nombre formaté
- **Label** : "Scored" / "Scorés"

### 4.3 Pourcentage scoré

- **Calcul** : `scored / total × 100`
- **Affichage** : Pourcentage avec 1 décimale (ex: `87.3%`)
- **Label** : "Coverage" / "Couverture"
- **Couleur indicateur** :
  - ≥90% → vert (`#4ade80`)
  - 70-89% → or (`#c9a227`)
  - <70% → rouge (`#ff8888`)

### 4.4 Score moyen global

- **Requête** : `SELECT AVG(relevance_score) FROM articles WHERE relevance_score IS NOT NULL`
- **Affichage** : Moyenne avec 1 décimale (ex: `5.2`)
- **Label** : "Avg score" / "Score moy."

---

## 5. Section 2 — Activity KPIs

Trois **cards KPI** en ligne, pour mesurer l'activité récente.

### 5.1 Articles ajoutés (24h)

- **Requête** : `SELECT COUNT(*) FROM articles WHERE pub_date >= NOW() - INTERVAL '24 hours'`
- **Label** : "New 24h" / "Nouveaux 24h"

### 5.2 Articles ajoutés (7 jours)

- **Requête** : `SELECT COUNT(*) FROM articles WHERE pub_date >= NOW() - INTERVAL '7 days'`
- **Label** : "New 7d" / "Nouveaux 7j"

### 5.3 Scorés dernières 24h

- **Requête** : `SELECT COUNT(*) FROM articles WHERE scored_at >= NOW() - INTERVAL '24 hours'`
- **Label** : "Scored 24h" / "Scorés 24h"

---

## 6. Section 3 — Topic Selector

Barre d'onglets identique au composant `TopicTabBar` existant, avec un onglet supplémentaire **"All"** en première position qui agrège tous les topics.

- **Default** : "All"
- **Comportement** : Sélectionner un topic filtre toutes les sections en dessous (distribution, table des feeds, top articles)

---

## 7. Section 4 — Score Distribution

Graphique en **barres horizontales CSS** (pas de librairie chart), pour le topic sélectionné.

### 7.1 Fourchettes de score

| Fourchette | Label | Couleur |
|---|---|---|
| 9-10 | Excellent | `#22c55e` (vert vif) |
| 7-8 | Good | `#c9a227` (gold) |
| 5-6 | Average | `#eab308` (jaune) |
| 3-4 | Low | `#f97316` (orange) |
| 1-2 | Noise | `#ef4444` (rouge) |

### 7.2 Données

Pour chaque fourchette :
- **Nombre d'articles** dans la fourchette
- **Pourcentage** par rapport au total scoré
- **Barre CSS** proportionnelle au pourcentage (largeur en %)

### 7.3 Requête

```sql
SELECT
  CASE
    WHEN relevance_score >= 9 THEN '9-10'
    WHEN relevance_score >= 7 THEN '7-8'
    WHEN relevance_score >= 5 THEN '5-6'
    WHEN relevance_score >= 3 THEN '3-4'
    ELSE '1-2'
  END AS tier,
  COUNT(*) AS count
FROM articles
WHERE relevance_score IS NOT NULL
  AND topic = :topic  -- omis si "All"
GROUP BY tier
```

---

## 8. Section 5 — Feed Ranking Table (objectif principal)

**Tableau trié par score moyen décroissant**, c'est le coeur de la page Stats.

### 8.1 Colonnes

| Colonne | Description | Tri |
|---|---|---|
| **#** | Rang (par score moyen) | — |
| **Source** | Nom du flux RSS (`source`) | — |
| **Total** | Nombre total d'articles | Triable |
| **Scored** | Nombre d'articles scorés | Triable |
| **Avg** | Score moyen | Triable (défaut ↓) |
| **Hit rate** | % d'articles avec score ≥ 7 | Triable |
| **9-10** | % d'articles scorés 9 ou 10 | Triable |
| **7-8** | % d'articles scorés 7 ou 8 | Triable |
| **5-6** | % d'articles scorés 5 ou 6 | — |
| **3-4** | % d'articles scorés 3 ou 4 | — |
| **1-2** | % d'articles scorés 1 ou 2 | — |

### 8.2 Détails visuels

- Chaque ligne a une **mini barre de score** colorée (dégradé rouge→or→vert) proportionnelle au score moyen
- Le **hit rate** est mis en avant :
  - ≥50% → vert
  - 30-49% → or
  - <30% → rouge
- Les colonnes de % par fourchette sont affichées sous forme de **mini cellules colorées** avec le % dedans (comme un heatmap)
- En mode "All", la colonne **Topic** apparaît en plus pour identifier de quel topic vient chaque feed

### 8.3 Requête

```sql
SELECT
  source,
  topic,
  COUNT(*) AS total,
  COUNT(relevance_score) AS scored,
  AVG(relevance_score) AS avg_score,
  COUNT(*) FILTER (WHERE relevance_score >= 7)::float / NULLIF(COUNT(relevance_score), 0) AS hit_rate,
  COUNT(*) FILTER (WHERE relevance_score >= 9)::float / NULLIF(COUNT(relevance_score), 0) AS pct_9_10,
  COUNT(*) FILTER (WHERE relevance_score BETWEEN 7 AND 8)::float / NULLIF(COUNT(relevance_score), 0) AS pct_7_8,
  COUNT(*) FILTER (WHERE relevance_score BETWEEN 5 AND 6)::float / NULLIF(COUNT(relevance_score), 0) AS pct_5_6,
  COUNT(*) FILTER (WHERE relevance_score BETWEEN 3 AND 4)::float / NULLIF(COUNT(relevance_score), 0) AS pct_3_4,
  COUNT(*) FILTER (WHERE relevance_score BETWEEN 1 AND 2)::float / NULLIF(COUNT(relevance_score), 0) AS pct_1_2
FROM articles
WHERE relevance_score IS NOT NULL
  AND topic = :topic  -- omis si "All"
GROUP BY source, topic
ORDER BY avg_score DESC
```

### 8.4 Filtre par période

Un sélecteur simple au-dessus du tableau :
- **All time** (défaut)
- **7 days**
- **30 days**

Permet de comparer la qualité des feeds sur différentes fenêtres temporelles.

---

## 9. Section 6 — Top 10 Articles

Les 10 articles avec le **score le plus élevé** pour le topic sélectionné (ou tous les topics en mode "All").

### 9.1 Colonnes

| Colonne | Description |
|---|---|
| **Score** | Badge coloré (9-10 vert, 7-8 or) |
| **Source** | Nom du flux |
| **Title** | Titre de l'article (lien cliquable vers l'article original) |
| **Date** | `pub_date` formatée en locale |
| **Reason** | `score_reason` tronqué à 80 chars |

### 9.2 Requête

```sql
SELECT title, link, source, pub_date, relevance_score, score_reason
FROM articles
WHERE relevance_score IS NOT NULL
  AND topic = :topic  -- omis si "All"
ORDER BY relevance_score DESC, pub_date DESC
LIMIT 10
```

---

## 10. Section 7 — Topic Comparison (mode "All" uniquement)

Visible uniquement quand l'onglet "All" est actif. Tableau comparatif des 8 topics.

### 10.1 Colonnes

| Colonne | Description |
|---|---|
| **Topic** | Nom du topic (avec label i18n) |
| **Total** | Nombre total d'articles |
| **Scored** | Nombre scorés |
| **% Scored** | Couverture de scoring |
| **Avg score** | Score moyen |
| **Hit rate** | % d'articles ≥ 7 |
| **Feeds** | Nombre de feeds configurés |
| **Active feeds** | Nombre de feeds ayant produit ≥1 article dans les 7 derniers jours |

### 10.2 Requête

```sql
SELECT
  topic,
  COUNT(*) AS total,
  COUNT(relevance_score) AS scored,
  AVG(relevance_score) AS avg_score,
  COUNT(*) FILTER (WHERE relevance_score >= 7)::float / NULLIF(COUNT(relevance_score), 0) AS hit_rate,
  COUNT(DISTINCT source) AS active_sources
FROM articles
GROUP BY topic
ORDER BY avg_score DESC
```

---

## 11. API Endpoint

### `GET /api/stats`

**Query parameters :**

| Param | Type | Default | Description |
|---|---|---|---|
| `topic` | string \| `"all"` | `"all"` | Filtre par topic |
| `days` | int | 0 | Filtre temporel (0 = all time) |

**Response shape :**

```typescript
interface StatsResponse {
  global: {
    totalArticles: number;
    scoredArticles: number;
    pctScored: number;
    avgScore: number;
    new24h: number;
    new7d: number;
    scored24h: number;
  };
  scoreDistribution: Array<{
    tier: string;       // "9-10", "7-8", "5-6", "3-4", "1-2"
    count: number;
    pct: number;
  }>;
  feedRanking: Array<{
    source: string;
    topic: string;
    total: number;
    scored: number;
    avgScore: number;
    hitRate: number;    // % articles >= 7
    pct9_10: number;
    pct7_8: number;
    pct5_6: number;
    pct3_4: number;
    pct1_2: number;
  }>;
  topArticles: Array<{
    title: string;
    link: string;
    source: string;
    pubDate: string;
    score: number;
    reason: string;
  }>;
  topicComparison: Array<{
    topic: string;
    total: number;
    scored: number;
    pctScored: number;
    avgScore: number;
    hitRate: number;
    activeSources: number;
    totalFeeds: number;
  }>;
}
```

---

## 12. Design & UX

### 12.1 Charte graphique

Identique à l'application principale :
- Background : `#000000`
- Cards : `#111` avec border `#2a2a2a`
- Accent : `#c9a227` (gold)
- Texte : `#f5f5f5` / `#999` / `#666`

### 12.2 KPI Cards

```
┌──────────────────┐
│  12,847          │  ← Valeur en gros (24px, bold, gold)
│  Total articles  │  ← Label (12px, uppercase, #999)
└──────────────────┘
```

- 4 cards en première ligne, 3 en seconde
- Responsive : 2 colonnes sur mobile

### 12.3 Barres de score

Barres CSS pures (pas de librairie) :
```
9-10  ████████████  12%  (134 articles)
```
- Hauteur : 24px
- Border-radius : 4px
- Couleur : selon la fourchette (voir section 7.1)
- Largeur : proportionnelle au pourcentage max

### 12.4 Feed Ranking Table

- Header sticky
- Lignes alternées (`#111` / `#0d0d0d`)
- Hover : `#1a1a1a`
- Colonnes triables au clic (icône ▲▼)
- Score moyen en gras, coloré selon la valeur
- Sur mobile : scroll horizontal avec la colonne Source fixée à gauche

### 12.5 Internationalisation

| Clé | EN | FR |
|---|---|---|
| `statsTitle` | Stats | Stats |
| `totalArticles` | Total articles | Total articles |
| `scoredArticles` | Scored | Scorés |
| `coverage` | Coverage | Couverture |
| `avgScore` | Avg score | Score moy. |
| `new24h` | New 24h | Nouveaux 24h |
| `new7d` | New 7d | Nouveaux 7j |
| `scored24h` | Scored 24h | Scorés 24h |
| `scoreDistrib` | Score distribution | Distribution des scores |
| `feedRanking` | Feed ranking | Classement des flux |
| `topArticles` | Top articles | Meilleurs articles |
| `topicComparison` | Topic comparison | Comparaison des topics |
| `hitRate` | Hit rate | Taux de pertinence |
| `allTopics` | All | Tous |
| `allTime` | All time | Tout |
| `last7d` | Last 7 days | 7 derniers jours |
| `last30d` | Last 30 days | 30 derniers jours |

---

## 13. Cas d'usage concrets

### 13.1 Identifier les flux RSS à remplacer

→ Trier la table des feeds par **score moyen croissant**. Les feeds avec un score moyen < 4 et un hit rate < 15% sont candidats au remplacement.

### 13.2 Identifier les meilleurs flux

→ Trier par **hit rate décroissant**. Les feeds avec hit rate > 50% sont les plus rentables en termes de contenu pertinent.

### 13.3 Détecter un flux mort

→ Regarder le feed ranking filtré sur "7 days". Les feeds avec **0 articles** sur les 7 derniers jours sont potentiellement morts ou en erreur.

### 13.4 Comparer les topics

→ En mode "All", la section Topic Comparison montre quels topics ont la meilleure couverture de scoring, le meilleur score moyen, et combien de feeds sont actifs. Un topic avec peu de feeds actifs nécessite de remplacer des sources.

### 13.5 Évaluer la qualité du scoring

→ La distribution des scores devrait suivre une courbe en cloche légèrement décalée vers 3-6. Si 80% des articles sont à 1-2, le prompt de scoring est peut-être trop strict. Si 80% sont à 8-10, il est trop laxiste.

---

## 14. Implémentation — Fichiers à créer/modifier

| Fichier | Action | Description |
|---|---|---|
| `src/app/api/stats/route.ts` | **Créer** | Endpoint API qui agrège toutes les stats depuis Supabase |
| `src/lib/supabase.ts` | **Modifier** | Ajouter les fonctions de requête stats |
| `src/app/page.tsx` | **Modifier** | Remplacer le placeholder `StatsPage` par le vrai composant |
| `src/lib/i18n.ts` | **Modifier** | Ajouter les clés de traduction stats |

---

## 15. Performance

- L'endpoint `/api/stats` exécute toutes les requêtes SQL en **parallèle** (`Promise.all`)
- Les résultats sont **cachés côté client** tant que l'utilisateur reste sur la page Stats
- Les requêtes Supabase utilisent des agrégations SQL, pas de traitement JS sur des milliers de lignes
- Le filtre par période (`days`) utilise un index sur `pub_date` pour des requêtes rapides
