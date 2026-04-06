# spec-cron-monitor.md — Page de monitoring des crons (Fetch & Score)

> Version: 1.0 — Avril 2026
> Status: SPEC (not implemented)

---

## 1. Objectif

Créer une nouvelle page **"Cron Monitor"** dans l'interface, accessible via un nouvel icône dans le header, pour **visualiser en temps réel l'activité des crons de fetch et de scoring**. Cette page permet de :

1. Voir le statut de chaque topic (dernier fetch, dernier score, backlog d'articles non scorés).
2. Suivre le volume d'articles fetchés et scorés dans le temps (par heure, par jour).
3. Détecter les anomalies (topic bloqué, feed en erreur, backlog croissant, scoring en retard).
4. Analyser les performances pour optimiser les paramètres des crons.

---

## 2. Données disponibles en BDD

### 2.1 Données existantes (aucune migration requise)

| Source | Données exploitables |
|--------|---------------------|
| `topics.last_fetched_at` | Timestamp du dernier fetch réussi par topic |
| `topics.last_scored_at` | Timestamp du dernier scoring réussi par topic |
| `articles.pub_date` | Date de publication (≈ date d'insertion) |
| `articles.scored_at` | Timestamp du scoring effectif |
| `articles.relevance_score` | `null` = non scoré, 1-10 = scoré |
| `articles.topic` | Topic associé |
| `articles.source` | Nom du feed source |

### 2.2 Métriques calculables à partir des données existantes

| Métrique | Calcul |
|----------|--------|
| **Articles fetchés / heure** | `COUNT(*) WHERE pub_date BETWEEN h AND h+1` groupé par heure |
| **Articles scorés / heure** | `COUNT(*) WHERE scored_at BETWEEN h AND h+1` groupé par heure |
| **Backlog non scoré** | `COUNT(*) WHERE relevance_score IS NULL AND pub_date >= now - 7j` |
| **Délai moyen fetch→score** | `AVG(scored_at - pub_date)` |
| **Coverage temps réel** | `scorés / total` sur la dernière heure/journée |
| **Dernier fetch/score** | `last_fetched_at` / `last_scored_at` depuis `topics` |
| **Temps depuis dernier passage** | `now() - last_fetched_at` / `now() - last_scored_at` |

---

## 3. Design UX

### 3.1 Navigation

Nouvel icône **📈** (graphe en hausse) dans le header, entre l'icône Stats et l'icône Topics.

**SVG** (style line chart) :
```svg
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
</svg>
```

**État** : `currentPage` évolue de `"home" | "stats" | "topics" | "settings"` à `"home" | "stats" | "crons" | "topics" | "settings"`.

### 3.2 Layout de la page

```
┌──────────────────────────────────────────────────────────────┐
│  Cron Monitor                                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────┬──────────┬──────────┬──────────┬──────────┐    │
│  │ Backlog │ Fetched  │ Scored   │ Coverage │ Avg delay│    │
│  │   342   │ 1,204/24h│  862/24h │  71.6%   │  12 min  │    │
│  └─────────┴──────────┴──────────┴──────────┴──────────┘    │
│                                                              │
│  ── Topic Status ──────────────────────────────────────────  │
│                                                              │
│  Topic        Last fetch    Last score    Backlog   Status   │
│  Iran War     2 min ago     4 min ago       12      ✅ OK    │
│  AI           7 min ago     1 min ago        8      ✅ OK    │
│  AI Eng.     12 min ago    14 min ago       45      ⚠️ Slow  │
│  Robotics     3 min ago     6 min ago        5      ✅ OK    │
│  Crypto       8 min ago     9 min ago       22      ✅ OK    │
│  Bitcoin      5 min ago    11 min ago       18      ✅ OK    │
│  Video Games 11 min ago     3 min ago        3      ✅ OK    │
│  Elon Musk    6 min ago     8 min ago       15      ✅ OK    │
│  Anthropic    9 min ago    13 min ago      214      🔴 High  │
│                                                              │
│  ── Activity Timeline (last 24h) ─────────────────────────  │
│                                                              │
│  Heure    Fetchés   Scorés   Backlog   Coverage              │
│  15:00      52        48       12       92.3%                │
│  14:00      61        55       18       90.2%                │
│  13:00      48        50        7       95.8%                │
│  12:00      55        42       20       76.4%                │
│  11:00      63        60       12       95.2%                │
│  ...                                                         │
│                                                              │
│  ── Fetch/Score Chart (bar chart) ────────────────────────   │
│                                                              │
│  ████ Fetchés   ░░░░ Scorés                                  │
│                                                              │
│  15h ████████████ ░░░░░░░░░░                                 │
│  14h ██████████████ ░░░░░░░░░░░░                             │
│  13h ██████████ ░░░░░░░░░░░░                                 │
│  ...                                                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 Sections détaillées

#### Section 1 — KPIs globaux (5 boxes compactes sur une ligne)

| KPI | Calcul | Couleur conditionnelle |
|-----|--------|----------------------|
| **Backlog** | Articles non scorés (7 derniers jours) | Vert <50, Orange 50-200, Rouge >200 |
| **Fetched 24h** | Articles avec `pub_date` dans les dernières 24h | Toujours doré |
| **Scored 24h** | Articles avec `scored_at` dans les dernières 24h | Toujours doré |
| **Coverage 24h** | `scored_24h / fetched_24h × 100` | Vert >90%, Orange 70-90%, Rouge <70% |
| **Avg delay** | Moyenne `scored_at - pub_date` (minutes), uniquement articles avec `pub_date` dans les 24h (cohorte fetch 24h) et `relevance_score` + `scored_at` renseignés | Vert <15min, Orange 15-60min, Rouge >60min |

#### Section 2 — Statut par topic (tableau)

| Colonne | Source | Description |
|---------|--------|-------------|
| **Topic** | `topics.label_en/fr` | Nom du topic |
| **Last fetch** | `topics.last_fetched_at` | "X min ago" / "X h ago" |
| **Last score** | `topics.last_scored_at` | "X min ago" / "X h ago" |
| **Backlog** | `COUNT(articles) WHERE topic=X AND relevance_score IS NULL AND pub_date >= 7j` | Nombre d'articles non scorés |
| **Status** | Calculé | ✅ OK / ⚠️ Slow / 🔴 High |

**Règles de statut** :
- ✅ **OK** : backlog < 50 ET dernier fetch < 15min ET dernier score < 15min
- ⚠️ **Slow** : backlog 50-200 OU dernier fetch/score > 15min
- 🔴 **High** : backlog > 200 OU dernier fetch/score > 30min

#### Section 3 — Timeline d'activité (tableau heure par heure, 24 dernières heures)

| Colonne | Calcul |
|---------|--------|
| **Heure** | Tranche horaire (15:00, 14:00, ...) |
| **Fetchés** | `COUNT(*) WHERE pub_date IN [h, h+1)` |
| **Scorés** | `COUNT(*) WHERE scored_at IN [h, h+1)` |
| **Backlog** | Cumulé non scoré à cette heure (calculé côté client) |
| **Coverage** | `scorés / fetchés × 100` pour cette heure |

#### Section 4 — Graphique d'activité (barres horizontales)

Graphique en barres empilées pour les 24 dernières heures :
- **Barre dorée** : articles fetchés
- **Barre verte** : articles scorés
- Les barres sont normalisées par rapport au max de la période

---

## 4. Nouvelle API Route

### 4.1 `GET /api/cron-stats`

**Rôle** : Retourne toutes les métriques nécessaires pour la page Cron Monitor.

**Query params** : aucun (toujours les 24 dernières heures + backlog total)

**Réponse (200)** :
```json
{
  "global": {
    "backlog": 342,
    "fetched24h": 1204,
    "scored24h": 862,
    "coverage24h": 71.6,
    "avgDelayMinutes": 12
  },
  "topics": [
    {
      "id": "conflict",
      "label": "Iran War",
      "lastFetchedAt": "2026-04-01T15:02:00Z",
      "lastScoredAt": "2026-04-01T14:58:00Z",
      "backlog": 12,
      "status": "ok"
    },
    ...
  ],
  "timeline": [
    {
      "hour": "2026-04-01T15:00:00Z",
      "fetched": 52,
      "scored": 48
    },
    {
      "hour": "2026-04-01T14:00:00Z",
      "fetched": 61,
      "scored": 55
    },
    ...
  ]
}
```

### 4.2 Logique interne

```
GET /api/cron-stats
  │
  ├─ 1. Lire les topics actifs avec last_fetched_at / last_scored_at
  │
  ├─ 2. Compter le backlog par topic
  │     SELECT topic, COUNT(*) FROM articles
  │     WHERE relevance_score IS NULL
  │       AND pub_date >= now() - interval '7 days'
  │     GROUP BY topic
  │
  ├─ 3. Articles fetchés/scorés par heure (24h)
  │     SELECT
  │       date_trunc('hour', pub_date) AS hour,
  │       COUNT(*) AS fetched
  │     FROM articles WHERE pub_date >= now() - interval '24 hours'
  │     GROUP BY hour ORDER BY hour DESC
  │
  │     SELECT
  │       date_trunc('hour', scored_at) AS hour,
  │       COUNT(*) AS scored
  │     FROM articles WHERE scored_at >= now() - interval '24 hours'
  │     GROUP BY hour ORDER BY hour DESC
  │
  ├─ 4. Délai moyen fetch→score (24h)
  │     SELECT AVG(EXTRACT(EPOCH FROM (scored_at - pub_date)) / 60)
  │     FROM articles
  │     WHERE scored_at >= now() - interval '24 hours'
  │       AND scored_at > pub_date
  │
  └─ 5. Assembler la réponse JSON
```

**Note** : Supabase JS SDK ne supporte pas `date_trunc` natif. Les agrégations horaires seront calculées **côté serveur en JS** à partir des articles bruts (comme pour `/api/stats`). Pour optimiser, on ne récupère que `pub_date` et `scored_at` des articles des dernières 24h.

### 4.3 Requêtes Supabase

```typescript
// Backlog par topic (articles non scorés, 7 derniers jours)
const { data: backlogRows } = await supabase
  .from("articles")
  .select("topic")
  .gte("pub_date", since7d)
  .is("relevance_score", null);

// Articles des dernières 24h (pour timeline)
const { data: recent } = await supabase
  .from("articles")
  .select("pub_date, scored_at, topic")
  .gte("pub_date", since24h);

// Délai moyen (articles scorés dans les dernières 24h)
const { data: scoredRecent } = await supabase
  .from("articles")
  .select("pub_date, scored_at")
  .gte("scored_at", since24h)
  .not("scored_at", "is", null);
```

---

## 5. TypeScript Interfaces

```typescript
export interface CronStatsResponse {
  global: {
    backlog: number;
    fetched24h: number;
    scored24h: number;
    coverage24h: number;
    avgDelayMinutes: number;
  };
  topics: Array<{
    id: string;
    label: string;
    lastFetchedAt: string | null;
    lastScoredAt: string | null;
    backlog: number;
    status: "ok" | "slow" | "high";
  }>;
  timeline: Array<{
    hour: string;
    fetched: number;
    scored: number;
  }>;
}
```

---

## 6. Nouvelles clés i18n

```typescript
cronMonitor: { en: "Cron Monitor", fr: "Monitoring Crons" },
backlog: { en: "Backlog", fr: "En attente" },
fetched24h: { en: "Fetched 24h", fr: "Fetchés 24h" },
scored24hCron: { en: "Scored 24h", fr: "Scorés 24h" },
coverage24h: { en: "Coverage 24h", fr: "Couverture 24h" },
avgDelay: { en: "Avg delay", fr: "Délai moy." },
lastFetch: { en: "Last fetch", fr: "Dernier fetch" },
lastScore: { en: "Last score", fr: "Dernier score" },
topicStatus: { en: "Topic Status", fr: "Statut des topics" },
activityTimeline: { en: "Activity (last 24h)", fr: "Activité (dernières 24h)" },
statusOk: { en: "OK", fr: "OK" },
statusSlow: { en: "Slow", fr: "Lent" },
statusHigh: { en: "High backlog", fr: "Backlog élevé" },
minutesAgo: { en: "min ago", fr: "min" },
hoursAgo: { en: "h ago", fr: "h" },
hour: { en: "Hour", fr: "Heure" },
fetchedCol: { en: "Fetched", fr: "Fetchés" },
scoredCol: { en: "Scored", fr: "Scorés" },
```

---

## 7. Fichiers à créer

| Fichier | Description |
|---------|-------------|
| `src/app/api/cron-stats/route.ts` | Endpoint de monitoring des crons |

---

## 8. Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `src/app/page.tsx` | Ajouter `CronMonitorPage` component, icône dans le header, `"crons"` dans `currentPage` |
| `src/lib/i18n.ts` | Ajouter ~18 clés i18n |
| `src/lib/types.ts` | Ajouter `CronStatsResponse` interface |

---

## 9. Composant `CronMonitorPage`

### 9.1 Structure

```tsx
function CronMonitorPage({ lang }: { lang: Lang }) {
  const [data, setData] = useState<CronStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cron-stats", { cache: "no-store" })
      .then(r => r.json())
      .then(setData)
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  // Auto-refresh toutes les 60 secondes
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/cron-stats", { cache: "no-store" })
        .then(r => r.json())
        .then(setData)
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Render: KPIs → Topic Status → Timeline → Bar Chart
}
```

### 9.2 Refresh automatique

La page se rafraîchit **toutes les 60 secondes** automatiquement pour refléter l'activité des crons en quasi temps réel. Un indicateur discret (point qui pulse) signale le mode auto-refresh.

### 9.3 Formatage du temps relatif

```typescript
function timeAgo(iso: string | null, lang: Lang): string {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return lang === "fr" ? "< 1 min" : "< 1 min ago";
  if (mins < 60) return `${mins} ${t("minutesAgo", lang)}`;
  const hours = Math.floor(mins / 60);
  return `${hours} ${t("hoursAgo", lang)}`;
}
```

---

## 10. Détail du graphique barres

Le graphique d'activité affiche les 24 dernières heures en barres horizontales empilées :

```
15h  ████████████████████ 52  ░░░░░░░░░░░░░░░░░ 48
14h  ██████████████████████████ 61  ░░░░░░░░░░░░░░░░░░░░ 55
13h  ████████████████ 48  ░░░░░░░░░░░░░░░░░░ 50
12h  ██████████████████████ 55  ░░░░░░░░░░░░░░ 42
```

- **Barre dorée** (`color.gold`) : articles fetchés
- **Barre verte** (`#22c55e`) : articles scorés
- Chaque barre est normalisée par rapport au max de la période
- Largeur min : 2px (pour les heures avec 0 articles)
- Hover : affiche le nombre exact

---

## 11. Performance

| Opération | Temps estimé |
|-----------|-------------|
| Lire topics actifs | < 100ms |
| Compter backlogs par topic | < 500ms (scan sur index `topic` + `relevance_score IS NULL`) |
| Articles 24h pour timeline | < 500ms (filtré par `pub_date >= 24h`) |
| Calcul agrégations horaires (JS) | < 50ms |
| **Total** | **< 1.5s** |

---

## 12. Plan d'implémentation

1. Ajouter `CronStatsResponse` dans `types.ts`
2. Créer `src/app/api/cron-stats/route.ts`
3. Ajouter les clés i18n
4. Créer le composant `CronMonitorPage` dans `page.tsx`
5. Ajouter l'icône dans le header et `"crons"` dans `currentPage`
6. Tester avec les données en production

Un seul prompt devrait suffire pour implémenter toute la spec.
