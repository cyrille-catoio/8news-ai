# spec-feed.md — Auto-découverte de flux RSS par IA lors de la création d'un topic

> Version: 1.0 — Mars 2026
> Status: SPEC (not implemented)

---

## 1. Objectif

Lors de la création d'un nouveau topic, proposer une option visible (checkbox) permettant de demander à l'IA de **rechercher automatiquement 10 flux RSS pertinents**, de **vérifier que chaque flux n'est pas vide** (contient au moins 1 article parsable), puis d'**insérer les flux valides en base de données** liés au topic nouvellement créé.

Cela évite à l'utilisateur de chercher manuellement des URLs RSS après avoir créé un topic.

---

## 2. Flux utilisateur

### 2.1 Parcours dans le formulaire de création

```
┌──────────────────────────────────────────────────┐
│  ← Retour    New Topic                           │
├──────────────────────────────────────────────────┤
│  Slug (ID)     [ my-new-topic        ]           │
│  Label EN      [ My New Topic        ]           │
│  Label FR      [ Mon nouveau topic   ]           │
│                                                  │
│  Scoring criteria                                │
│  Domain        [ description du domaine...     ] │
│  ✨ Generate with AI                             │
│  9-10          [ ... ]                           │
│  7-8           [ ... ]   5-6  [ ... ]            │
│  3-4           [ ... ]   1-2  [ ... ]            │
│                                                  │
│  Analysis Prompt (optional)                      │
│  [EN] [FR]                                       │
│  [ ... prompt textarea ... ]                     │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │  🔍 ☑ Find 10 RSS feeds automatically       │ │
│ │                                              │ │
│ │  The AI will search for relevant RSS feeds   │ │
│ │  based on the topic domain and verify they   │ │
│ │  contain articles before adding them.        │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│              [Create topic]                      │
└──────────────────────────────────────────────────┘
```

### 2.2 Étapes après clic sur « Create topic »

1. Le topic est créé en BDD (appel `POST /api/topics` — existant).
2. L'utilisateur est redirigé vers la page détail du topic (comportement actuel).
3. **Si la checkbox est cochée** : un appel est lancé en arrière-plan vers `POST /api/topics/[id]/discover-feeds`.
4. Un indicateur de chargement s'affiche dans la section feeds de la page détail (ex: « 🔍 Searching for RSS feeds… »).
5. L'API :
   - a) Demande à l'IA de générer 10 URLs de flux RSS pertinents pour le domaine.
   - b) Vérifie chaque URL en parallèle (fetch HTTP + parse XML/RSS).
   - c) N'insère en BDD que les flux qui répondent et contiennent ≥ 1 article.
   - d) Retourne la liste des flux ajoutés + ceux rejetés (avec raison).
6. La page détail se met à jour avec les feeds trouvés.

---

## 3. Nouvelle API Route

### 3.1 `POST /api/topics/[id]/discover-feeds`

**Rôle** : Utilise l'IA pour trouver des flux RSS pertinents, les valide, et insère les valides en BDD.

**Body** : aucun (le domaine est lu depuis le topic en BDD).

**Réponse (200)** :
```json
{
  "added": [
    { "name": "TechCrunch AI", "url": "https://techcrunch.com/category/artificial-intelligence/feed/" },
    { "name": "Ars Technica", "url": "https://feeds.arstechnica.com/arstechnica/technology-lab" }
  ],
  "rejected": [
    { "name": "Example Blog", "url": "https://example.com/rss", "reason": "HTTP 404" },
    { "name": "Empty Feed", "url": "https://empty.com/feed", "reason": "No articles found" }
  ]
}
```

**Erreurs** :
| Code | Cas |
|------|-----|
| 404 | Topic introuvable |
| 500 | OPENAI_API_KEY manquante ou erreur IA |

### 3.2 Logique interne détaillée

```
POST /api/topics/[id]/discover-feeds
  │
  ├─ 1. Lire le topic depuis la BDD (id, label_en, scoring_domain)
  │     → 404 si introuvable
  │
  ├─ 2. Appel OpenAI (gpt-4.1-nano)
  │     System prompt : « Tu es un expert en sources RSS. Pour le domaine
  │     donné, retourne exactement 10 flux RSS avec nom et URL.
  │     Retourne du JSON valide uniquement. »
  │     User prompt : « Domain: {scoring_domain}, Topic: {label_en} »
  │     → Parse JSON : [{ name, url }]
  │
  ├─ 3. Validation en parallèle (Promise.allSettled, timeout 8s par feed)
  │     Pour chaque { name, url } :
  │       a) fetch(url) avec timeout 8 secondes
  │       b) Vérifier status HTTP 200
  │       c) Vérifier Content-Type contient "xml" ou "rss" ou "atom"
  │          OU que le body commence par "<?xml" ou "<rss" ou "<feed"
  │       d) Parser le body pour trouver au moins 1 <item> ou <entry>
  │       → Résultat : "valid" ou "rejected" + raison
  │
  ├─ 4. Dédoublonnage
  │     Vérifier que l'URL n'existe pas déjà pour ce topic (table feeds)
  │     → Exclure les doublons
  │
  ├─ 5. Insertion en BDD
  │     INSERT INTO feeds (topic_id, name, url) pour chaque flux valide
  │
  └─ 6. Réponse JSON { added: [...], rejected: [...] }
```

### 3.3 Prompt OpenAI pour la découverte

```
System:
You are an RSS feed expert. Given a news topic domain, suggest exactly 10 RSS feed URLs
that are most likely to contain relevant articles.

Prioritize:
- Major news outlets with dedicated RSS feeds (Reuters, BBC, AP, etc.)
- Specialized blogs and publications for the domain
- Google News RSS search URLs (https://news.google.com/rss/search?q=...)
- Hacker News filtered RSS (https://hnrss.org/newest?q=...)
- Subreddit RSS feeds (https://www.reddit.com/r/{sub}/.rss)

Return ONLY valid JSON (no markdown, no code fences):
[
  { "name": "Human-readable source name", "url": "https://full-rss-url" },
  ...
]

Exactly 10 items. Each URL must be a direct RSS/Atom feed URL (not an HTML page).
```

```
User:
Domain: {scoring_domain}
Topic: {label_en}
```

### 3.4 Validation d'un flux RSS

```typescript
async function validateFeed(url: string): Promise<{ valid: boolean; reason?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "8news-ai/1.0 RSS-Checker" },
    });
    
    if (!res.ok) return { valid: false, reason: `HTTP ${res.status}` };
    
    const text = await res.text();
    
    // Vérifier que c'est bien du XML/RSS/Atom
    const trimmed = text.trimStart().toLowerCase();
    const isXml = trimmed.startsWith("<?xml") || trimmed.startsWith("<rss") ||
                  trimmed.startsWith("<feed") || trimmed.startsWith("<!doctype");
    if (!isXml) return { valid: false, reason: "Not RSS/XML content" };
    
    // Vérifier qu'il contient au moins 1 item/entry
    const hasItems = text.includes("<item") || text.includes("<entry");
    if (!hasItems) return { valid: false, reason: "No articles found" };
    
    return { valid: true };
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "Timeout (8s)" : "Network error";
    return { valid: false, reason: msg };
  } finally {
    clearTimeout(timeout);
  }
}
```

---

## 4. Modifications Frontend

### 4.1 Nouveau state dans TopicsPage

```typescript
const [autoFeeds, setAutoFeeds] = useState(true);       // checkbox cochée par défaut
const [discoveringFeeds, setDiscoveringFeeds] = useState(false);
const [discoverResult, setDiscoverResult] = useState<{
  added: { name: string; url: string }[];
  rejected: { name: string; url: string; reason: string }[];
} | null>(null);
```

### 4.2 Checkbox dans le formulaire de création

Positionnée **entre** la section « Analysis Prompt » et le bouton « Create topic ».

Composant visuel :

```
┌─────────────────────────────────────────────────┐
│  🔍  ☑ Find 10 RSS feeds automatically          │
│                                                 │
│  The AI will search for relevant RSS feeds      │
│  based on the topic domain and verify they      │
│  contain articles before adding them.           │
└─────────────────────────────────────────────────┘
```

Caractéristiques :
- **Box distincte** avec `secStyle` (fond `color.surface`, bordure `color.border`, border-radius 10).
- **Checkbox** native stylée, cochée par défaut (`true`).
- **Titre** en gras avec icône 🔍, bien lisible (fontSize 14).
- **Description** en `color.textMuted`, fontSize 12, sous le titre.
- **Désactivée** si le champ Domain est vide (la recherche de feeds dépend du domaine).

### 4.3 Modification de `handleCreate`

La logique `handleCreate` actuelle :
1. POST /api/topics → crée le topic
2. Redirige vers la page détail (`loadDetail(created.id)`)

Nouvelle logique :
1. POST /api/topics → crée le topic
2. Redirige vers la page détail (`loadDetail(created.id)`)
3. **Si `autoFeeds` est coché** :
   - `setDiscoveringFeeds(true)`
   - Appel `POST /api/topics/{id}/discover-feeds`
   - `setDiscoverResult(data)`
   - `setDiscoveringFeeds(false)`
   - Recharger le détail (`loadDetail(id)`) pour afficher les feeds ajoutés

### 4.4 Indicateur de chargement dans la page détail

Quand `discoveringFeeds === true`, afficher dans la section feeds :

```
┌─────────────────────────────────────────────────┐
│  Feeds (0)                                      │
│                                                 │
│  ⏳ Searching for RSS feeds…                    │
│  ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░  (spinner animé)        │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 4.5 Résultat de la découverte

Quand `discoverResult` est rempli, afficher un résumé temporaire (toast ou section) :

```
✅ 7 feeds added successfully
❌ 3 feeds rejected (404, timeout, no articles)
```

Ce résumé est affiché une seule fois au-dessus de la liste des feeds, et disparaît au prochain rechargement ou navigation.

### 4.6 Nouvelles clés i18n

```typescript
autoFeedSearch: {
  en: "Find 10 RSS feeds automatically",
  fr: "Trouver 10 flux RSS automatiquement",
},
autoFeedSearchDesc: {
  en: "The AI will search for relevant RSS feeds based on the topic domain and verify they contain articles before adding them.",
  fr: "L'IA recherchera des flux RSS pertinents en fonction du domaine du topic et vérifiera qu'ils contiennent des articles avant de les ajouter.",
},
discoveringFeeds: {
  en: "Searching for RSS feeds…",
  fr: "Recherche de flux RSS…",
},
feedsAdded: {
  en: "feeds added successfully",
  fr: "flux ajoutés avec succès",
},
feedsRejected: {
  en: "feeds rejected",
  fr: "flux rejetés",
},
```

---

## 5. Fichiers à créer

| Fichier | Description |
|---------|-------------|
| `src/app/api/topics/[id]/discover-feeds/route.ts` | Endpoint de découverte auto de flux RSS |

---

## 6. Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `src/app/page.tsx` | Ajouter checkbox + state `autoFeeds`/`discoveringFeeds`/`discoverResult` dans TopicsPage. Modifier `handleCreate` pour déclencher la découverte. Ajouter indicateur de chargement + résumé dans la vue détail. |
| `src/lib/i18n.ts` | Ajouter 5 clés i18n (§4.6). |

---

## 7. Contraintes et edge cases

| Cas | Comportement |
|-----|-------------|
| Domain vide | Checkbox désactivée (grisée). |
| Checkbox décochée | Comportement actuel : topic créé sans feeds. |
| L'IA retourne du JSON invalide | L'API retourne `{ added: [], rejected: [] }` + log d'erreur serveur. Message « No feeds could be found » affiché à l'utilisateur. |
| Toutes les URLs sont invalides | `added: []`, tous dans `rejected`. Message « 0 feeds added, X rejected ». |
| URL dupliquée (déjà en BDD) | Ignorée silencieusement (pas insérée, pas dans `rejected`). |
| Timeout global de l'API > 30s | Peu probable (10 feeds × 8s max mais en parallèle = 8s max de validation). Timeout OpenAI ~5s. Total ~15s max. |
| Erreur réseau pendant la découverte | Message d'erreur affiché. Le topic reste créé (les feeds sont un ajout optionnel). |
| L'IA suggère des URLs HTML et non RSS | La validation échoue (pas de XML → rejeté). L'IA est guidée pour retourner des URLs RSS directes. |

---

## 8. Performance

| Étape | Temps estimé |
|-------|-------------|
| Appel OpenAI (génération 10 URLs) | 2-4s |
| Validation parallèle (10 fetches) | 3-8s (limité par le plus lent, timeout 8s) |
| Insertions BDD (~7 feeds valides) | < 200ms |
| **Total** | **5-12s** |

L'appel est asynchrone depuis le frontend : l'utilisateur voit sa page détail immédiatement et les feeds apparaissent au fur et à mesure.

---

## 9. Plan d'implémentation

### Étape 1 — Backend
1. Créer `src/app/api/topics/[id]/discover-feeds/route.ts` avec la logique complète (appel IA + validation + insertion).

### Étape 2 — Frontend
2. Ajouter les clés i18n.
3. Ajouter le state (`autoFeeds`, `discoveringFeeds`, `discoverResult`).
4. Ajouter la checkbox dans le formulaire de création.
5. Modifier `handleCreate` pour déclencher la découverte après création si cochée.
6. Ajouter l'indicateur de chargement et le résumé dans la vue détail.

### Étape 3 — Test
7. Créer un topic test avec la checkbox cochée.
8. Vérifier que les feeds valides sont insérés.
9. Vérifier que les feeds invalides sont correctement rejetés.
10. Vérifier le comportement avec la checkbox décochée.
