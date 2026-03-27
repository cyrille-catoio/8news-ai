# spec-topics.md — Dynamic Topics & Feeds (DB-driven)

> Version: 1.0 — March 2026
> Status: SPEC (not implemented)

---

## 1. Objectif

Migrer les topics et feeds RSS du code source vers la base de données Supabase, afin de :

1. Permettre à l'utilisateur de **créer ses propres topics** depuis l'UI.
2. Permettre d'**ajouter/modifier/supprimer des feeds RSS** par topic.
3. Rendre les **crons Netlify dynamiques** (une seule fonction fetch + une seule fonction score qui itèrent sur les topics en BDD).
4. Respecter la **limite de 15 secondes** par invocation Netlify.

---

## 2. Nouvelles tables Supabase

### 2.1 Table `topics`

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `text` | PK | Slug unique du topic (ex: `"conflict"`, `"my-custom-topic"`) |
| `label_en` | `text` | NOT NULL | Nom affiché en anglais |
| `label_fr` | `text` | NOT NULL | Nom affiché en français |
| `scoring_domain` | `text` | NOT NULL | Description du domaine pour le prompt de scoring (ex: `"Iran/USA/Israel conflict and Middle East geopolitics"`) |
| `scoring_tier1` | `text` | NOT NULL | Critère pour score 9-10 |
| `scoring_tier2` | `text` | NOT NULL | Critère pour score 7-8 |
| `scoring_tier3` | `text` | NOT NULL | Critère pour score 5-6 |
| `scoring_tier4` | `text` | NOT NULL | Critère pour score 3-4 |
| `scoring_tier5` | `text` | NOT NULL | Critère pour score 1-2 |
| `is_active` | `boolean` | DEFAULT true | Topic activé (pris en compte par les crons) |
| `sort_order` | `integer` | DEFAULT 0 | Ordre d'affichage dans l'UI |
| `created_at` | `timestamptz` | DEFAULT now() | Date de création |

**Index** : `topics_active_idx` sur `(is_active, sort_order)`.

**Seed** : Les 8 topics existants (`conflict`, `ai`, `aiengineering`, `robotics`, `crypto`, `bitcoin`, `videogames`, `elon`) sont insérés avec leurs labels et critères de scoring actuels (extraits de `i18n.ts` et `scoring-prompts.ts`).

### 2.2 Table `feeds`

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `serial` | PK | ID auto-incrémenté |
| `topic_id` | `text` | FK → topics(id) ON DELETE CASCADE | Topic associé |
| `name` | `text` | NOT NULL | Nom du feed (ex: `"BBC News"`) |
| `url` | `text` | NOT NULL | URL du flux RSS |
| `is_active` | `boolean` | DEFAULT true | Feed activé |
| `created_at` | `timestamptz` | DEFAULT now() | Date d'ajout |

**Index** : `feeds_topic_active_idx` sur `(topic_id, is_active)`.

**Contrainte unique** : `UNIQUE(topic_id, url)` — pas de doublon d'URL dans un même topic.

**Seed** : Les ~160 feeds actuels (de `rss-feeds.ts`) sont insérés avec leurs `topic_id` correspondants.

---

## 3. Migration SQL

```sql
-- 3.1 Créer la table topics
CREATE TABLE IF NOT EXISTS topics (
  id            text PRIMARY KEY,
  label_en      text NOT NULL,
  label_fr      text NOT NULL,
  scoring_domain text NOT NULL,
  scoring_tier1 text NOT NULL,
  scoring_tier2 text NOT NULL,
  scoring_tier3 text NOT NULL,
  scoring_tier4 text NOT NULL,
  scoring_tier5 text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS topics_active_idx ON topics (is_active, sort_order);

-- 3.2 Créer la table feeds
CREATE TABLE IF NOT EXISTS feeds (
  id         serial PRIMARY KEY,
  topic_id   text NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  name       text NOT NULL,
  url        text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(topic_id, url)
);
CREATE INDEX IF NOT EXISTS feeds_topic_active_idx ON feeds (topic_id, is_active);

-- 3.3 Seed (exemples — le script complet insère les 8 topics et ~160 feeds)
INSERT INTO topics (id, label_en, label_fr, scoring_domain, scoring_tier1, scoring_tier2, scoring_tier3, scoring_tier4, scoring_tier5, sort_order) VALUES
  ('conflict', 'Iran War', 'Iran War', 'Iran/USA/Israel conflict and Middle East geopolitics',
   'Major strike, peace treaty, new state intervention, UN resolution, casualty report >100',
   'Significant military operation, major sanctions, official leader statement with policy impact',
   'Diplomatic development, troop movement, sourced geopolitical analysis with data',
   'Commentary or opinion without new facts, recycled historical context',
   'Off-topic or no direct link to Iran/USA/Israel conflict', 0),
  -- ... 7 autres topics ...
;

INSERT INTO feeds (topic_id, name, url) VALUES
  ('conflict', 'BBC News', 'https://feeds.bbci.co.uk/news/world/rss.xml'),
  ('conflict', 'Al Jazeera', 'https://www.aljazeera.com/xml/rss/all.xml'),
  -- ... ~158 autres feeds ...
;
```

---

## 4. Nouvelles API Routes (Next.js)

### 4.1 `GET /api/topics`

Retourne la liste des topics actifs avec le nombre de feeds.

**Réponse** :
```json
[
  {
    "id": "conflict",
    "labelEn": "Iran War",
    "labelFr": "Iran War",
    "feedCount": 20,
    "isActive": true,
    "sortOrder": 0
  },
  ...
]
```

**Query** :
```sql
SELECT t.*, COUNT(f.id) as feed_count
FROM topics t
LEFT JOIN feeds f ON f.topic_id = t.id AND f.is_active = true
WHERE t.is_active = true
GROUP BY t.id
ORDER BY t.sort_order, t.created_at;
```

### 4.2 `GET /api/topics/[id]`

Retourne un topic avec tous ses feeds.

**Réponse** :
```json
{
  "id": "conflict",
  "labelEn": "Iran War",
  "labelFr": "Iran War",
  "scoringDomain": "Iran/USA/Israel conflict...",
  "scoringTier1": "...",
  "scoringTier2": "...",
  "scoringTier3": "...",
  "scoringTier4": "...",
  "scoringTier5": "...",
  "isActive": true,
  "sortOrder": 0,
  "feeds": [
    { "id": 1, "name": "BBC News", "url": "https://...", "isActive": true },
    ...
  ]
}
```

### 4.3 `POST /api/topics`

Crée un nouveau topic.

**Body** :
```json
{
  "id": "space",
  "labelEn": "Space",
  "labelFr": "Espace",
  "scoringDomain": "space exploration, NASA, ESA...",
  "scoringTier1": "...",
  "scoringTier2": "...",
  "scoringTier3": "...",
  "scoringTier4": "...",
  "scoringTier5": "..."
}
```

**Validation** :
- `id` : 2-30 caractères, uniquement `[a-z0-9-]`, unique.
- `labelEn`, `labelFr` : 1-50 caractères.
- `scoringDomain`, `scoringTier1..5` : 1-500 caractères.
- `sortOrder` : auto-incrémenté (max existant + 1).

### 4.4 `PATCH /api/topics/[id]`

Met à jour un topic (labels, critères de scoring, is_active, sort_order).

### 4.5 `DELETE /api/topics/[id]`

Désactive un topic (`is_active = false`). Ne supprime PAS les articles existants.

### 4.6 `POST /api/topics/[id]/feeds`

Ajoute un feed à un topic.

**Body** :
```json
{
  "name": "Space.com",
  "url": "https://www.space.com/feeds/all"
}
```

**Validation** :
- `url` : doit être une URL valide commençant par `http(s)://`.
- `name` : 1-100 caractères.
- Doublon `(topic_id, url)` → erreur 409.

### 4.7 `PATCH /api/topics/[id]/feeds/[feedId]`

Met à jour un feed (name, url, is_active).

### 4.8 `DELETE /api/topics/[id]/feeds/[feedId]`

Supprime un feed.

---

## 5. Stratégie Crons Netlify (limite 15s)

### 5.1 Problème

Actuellement : 16 fonctions Netlify séparées (8 fetch + 8 score), chacune dédiée à un topic hardcodé. Avec des topics dynamiques, on ne peut pas créer de fichier par topic.

Contrainte Netlify : **max 15 secondes** par invocation de scheduled function.

### 5.2 Solution : Crons « dispatcher » avec round-robin

**Principe** : 2 fonctions Netlify génériques (`cron-fetch.ts` et `cron-score.ts`) qui à chaque invocation ne traitent qu'**un seul topic** (le prochain dans la rotation).

**Mécanisme de rotation** :

La table `topics` reçoit 2 colonnes supplémentaires :

| Colonne | Type | Description |
|---------|------|-------------|
| `last_fetched_at` | `timestamptz` NULL | Dernier fetch réussi |
| `last_scored_at` | `timestamptz` NULL | Dernier scoring réussi |

Chaque invocation du cron :
1. Requête : `SELECT id FROM topics WHERE is_active = true ORDER BY last_fetched_at ASC NULLS FIRST LIMIT 1`
2. Traite CE topic uniquement (fetch OU score).
3. Met à jour `last_fetched_at` (ou `last_scored_at`).

**Avantage** : Chaque invocation ne traite qu'un topic → largement sous les 15 secondes. Le topic le plus « en retard » est toujours traité en premier.

### 5.3 Fréquence

| Fonction | Schedule | Effet avec 8 topics | Effet avec 16 topics |
|----------|----------|---------------------|----------------------|
| `cron-fetch` | `*/5 * * * *` (toutes les 5 min) | Chaque topic fetché ~toutes les 40 min | ~toutes les 80 min |
| `cron-score` | `*/3 * * * *` (toutes les 3 min) | Chaque topic scoré ~toutes les 24 min | ~toutes les 48 min |

Avec cette approche :
- **0 fichier à créer** quand l'utilisateur ajoute un topic.
- Chaque invocation traite 1 seul topic → **temps d'exécution < 10s**.
- Le round-robin garantit une **distribution équitable**.

### 5.4 Fichiers Netlify

On remplace les 16 fichiers actuels par 2 fichiers :

**`netlify/functions/cron-fetch.ts`** :
```typescript
import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { fetchAndStoreTopicDynamic } from "./shared/fetch-topic";

export default async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Pick the topic with the oldest (or null) last_fetched_at
  const { data: topic } = await supabase
    .from("topics")
    .select("id")
    .eq("is_active", true)
    .order("last_fetched_at", { ascending: true, nullsFirst: true })
    .limit(1)
    .single();

  if (!topic) return new Response("No active topics");

  const result = await fetchAndStoreTopicDynamic(topic.id, supabase);

  await supabase
    .from("topics")
    .update({ last_fetched_at: new Date().toISOString() })
    .eq("id", topic.id);

  return new Response(result);
};

export const config: Config = { schedule: "*/5 * * * *" };
```

**`netlify/functions/cron-score.ts`** :
```typescript
import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { scoreAndStoreTopicDynamic } from "./shared/score-topic";

export default async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Pick the topic with the oldest (or null) last_scored_at
  const { data: topic } = await supabase
    .from("topics")
    .select("id, scoring_domain, scoring_tier1, scoring_tier2, scoring_tier3, scoring_tier4, scoring_tier5")
    .eq("is_active", true)
    .order("last_scored_at", { ascending: true, nullsFirst: true })
    .limit(1)
    .single();

  if (!topic) return new Response("No active topics");

  const result = await scoreAndStoreTopicDynamic(topic.id, topic, supabase);

  await supabase
    .from("topics")
    .update({ last_scored_at: new Date().toISOString() })
    .eq("id", topic.id);

  return new Response(result);
};

export const config: Config = { schedule: "*/3 * * * *" };
```

### 5.5 Modifications des shared functions

**`fetch-topic.ts`** — nouvelle fonction `fetchAndStoreTopicDynamic(topicId, supabase)` :
- Au lieu de `getFeedsForTopic(topic)`, fait `SELECT name, url FROM feeds WHERE topic_id = $1 AND is_active = true`.
- Le reste de la logique est identique.
- L'ancienne `fetchAndStoreTopic()` est conservée temporairement pour compatibilité pendant la migration, puis supprimée.

**`score-topic.ts`** — nouvelle fonction `scoreAndStoreTopicDynamic(topicId, scoringCriteria, supabase)` :
- Au lieu de `getScoringPrompt(topic)`, construit le prompt à partir des colonnes `scoring_domain`, `scoring_tier1..5` lues depuis la BDD.
- Le reste de la logique est identique.

---

## 6. Modifications du Frontend

### 6.1 Chargement des topics depuis la BDD

**Actuellement** : `TOPICS` est un tableau hardcodé dans `page.tsx`. `getFeedsForTopic()` lit `rss-feeds.ts`.

**Après** :
- Au mount, le composant `Home` appelle `GET /api/topics` pour charger la liste dynamique.
- Les topics sont stockés dans un state : `useState<TopicItem[]>([])`.
- Interface :
  ```typescript
  interface TopicItem {
    id: string;
    labelEn: string;
    labelFr: string;
    feedCount: number;
  }
  ```
- Les constantes `TOPICS`, `VALID_TOPICS`, le type `Topic`, et `FEEDS_BY_TOPIC` deviennent obsolètes.
- Partout où le code utilise `Topic` comme union type, on utilise `string` à la place.

### 6.2 Nouvelle page « Topics » (page dédiée)

La gestion des topics et feeds est une **page à part entière**, au même titre que Stats et Settings. Elle est accessible via un **icône RSS** dans le header.

#### 6.2.1 Icône dans le header

L'ordre des icônes dans le header (de gauche à droite) devient :

| Icône | Page | SVG |
|-------|------|-----|
| 🏠 Maison | Home | `<path d="M3 9.5L12 3l9 6.5V20..."/>` (existant) |
| 📊 Barres | Stats | `<rect .../>` x3 (existant) |
| 📡 RSS/Signal | Topics | **Icône « signal Wi-Fi / ondes RSS »** (voir ci-dessous) |
| ⚙️ Engrenage | Settings | `<circle cx="12" cy="12" r="3"/>...` (existant) |

**SVG de l'icône Topics** — icône « signal / ondes RSS » (point + 2 arcs concentriques) :
```svg
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
  <path d="M4 11a9 9 0 0 1 9 9" />
  <path d="M4 4a16 16 0 0 1 16 16" />
  <circle cx="5" cy="19" r="1" fill="currentColor" />
</svg>
```

Ce symbole est universellement associé aux flux RSS et s'intègre dans la famille d'icônes existantes (trait fin, 18×18, stroke-based).

**État** : `currentPage` passe de `"home" | "stats" | "settings"` à `"home" | "stats" | "topics" | "settings"`.

**Rendu conditionnel** :
```tsx
{currentPage === "stats" ? (
  <StatsPage lang={lang} />
) : currentPage === "topics" ? (
  <TopicsPage lang={lang} />
) : currentPage === "settings" ? (
  <SettingsPage ... />
) : (
  // Home
)}
```

#### 6.2.2 Structure de la page Topics

La page `TopicsPage` est un composant React avec navigation interne sur 2 niveaux :

**Niveau 1 — Liste des topics** (vue par défaut) :

```
┌──────────────────────────────────────────────────┐
│  Topics                           [+ New Topic]  │
├──────────────────────────────────────────────────┤
│  #  Topic          Feeds   Statut  Actions       │
│  1  Iran War         20   ● Actif   ✏️ 🗑️        │
│  2  AI               20   ● Actif   ✏️ 🗑️        │
│  3  AI Eng.          20   ● Actif   ✏️ 🗑️        │
│  4  Robotics         19   ● Actif   ✏️ 🗑️        │
│  5  Crypto           20   ● Actif   ✏️ 🗑️        │
│  ...                                             │
└──────────────────────────────────────────────────┘
```

- Titre « Topics » avec le même style que « Stats » (doré, uppercase).
- Bouton « + New Topic » en haut à droite de la section.
- Tableau avec colonnes : **#** (sort_order) | **Topic** (label) | **Feeds** (count) | **Statut** (pastille vert/gris) | **Actions** (edit, delete).
- Clic sur le nom du topic → ouvre le **niveau 2** (détail du topic + ses feeds).
- Bouton edit (✏️) → ouvre un formulaire d'édition inline ou modal.
- Bouton delete (🗑️) → confirmation puis soft delete (is_active = false).
- Style : identique aux tableaux de la page Stats (fond sombre, bordures, hover).

**Niveau 2 — Détail d'un topic (ses feeds)** :

```
┌──────────────────────────────────────────────────┐
│  ← Retour    Iran War                            │
├──────────────────────────────────────────────────┤
│  Info topic                                      │
│  Label EN: Iran War     Label FR: Iran War       │
│  Domain: Iran/USA/Israel conflict and...         │
│  [Modifier]                                      │
├──────────────────────────────────────────────────┤
│  Feeds (20)                       [+ Add Feed]   │
├──────────────────────────────────────────────────┤
│  #  Source           URL                 Actions  │
│  1  BBC News         feeds.bbci.co.uk/…  ✏️ 🗑️   │
│  2  Al Jazeera       aljazeera.com/…     ✏️ 🗑️   │
│  3  The Guardian     theguardian.com/…   ✏️ 🗑️   │
│  ...                                             │
└──────────────────────────────────────────────────┘
```

- Lien « ← Retour » en haut pour revenir au niveau 1.
- Section info : affiche le label, le domaine de scoring, les 5 tiers. Bouton « Modifier » pour éditer.
- Section feeds : tableau avec **#** | **Source** (nom) | **URL** (tronquée, cliquable) | **Actions** (edit, delete).
- Bouton « + Add Feed » ouvre un formulaire inline (2 champs : nom + URL).
- L'URL du feed est affichée tronquée (hostname + path début) et cliquable (ouvre dans un nouvel onglet).
- Validation en temps réel : URL valide (`https://...`), nom non-vide, pas de doublon.

#### 6.2.3 Formulaire de création de topic

Accessible via le bouton « + New Topic » du niveau 1. Peut être un panneau qui remplace la liste (pas de modal) :

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
│  9-10 (best)   [ critère tier 1...             ] │
│  7-8           [ critère tier 2...             ] │
│  5-6           [ critère tier 3...             ] │
│  3-4           [ critère tier 4...             ] │
│  1-2 (worst)   [ critère tier 5...             ] │
│                                                  │
│              [Créer le topic]                    │
└──────────────────────────────────────────────────┘
```

- Slug auto-généré à partir du label EN (lowercase, espaces → tirets, caractères spéciaux supprimés). Modifiable manuellement.
- Champs domain et tiers : textarea, 2-3 lignes chacun.
- Le slug est validé côté client (`[a-z0-9-]`, 2-30 chars) et côté serveur (unicité).
- Après création, l'utilisateur est redirigé vers le niveau 2 du nouveau topic pour ajouter des feeds.

#### 6.2.4 Design

- **Même palette** que le reste de l'app : fond `color.bg`, cartes `color.surface`, bordures `color.border`, accents `color.gold`.
- **Même typographie** : labels en uppercase 11px, valeurs en 13-14px.
- **Inputs** : fond `color.surface`, bordure `color.border`, texte `color.text`, focus avec bordure `color.gold`.
- **Boutons primaires** : fond `color.gold`, texte `#000`, border-radius 6px.
- **Boutons danger** (delete) : fond transparent, texte rouge, confirmation requise.
- **Responsive** : le tableau des feeds passe en stack vertical sur mobile (<640px).

### 6.3 Sélecteurs de topics

Tous les composants qui affichent la liste des topics (`TopicToggle`, `TopicTabBar`, Stats tabs) utilisent la liste dynamique issue de `/api/topics` au lieu du tableau hardcodé.

### 6.4 Page Stats

- `FEED_SITE_URL` (mapping feed name → site URL) : construit à partir de `/api/topics/[id]` au lieu de `rss-feeds.ts`.
- La section « Topic Comparison » utilise la liste dynamique.

---

## 7. Fichiers à supprimer après migration

| Fichier | Raison |
|---------|--------|
| `src/lib/rss-feeds.ts` | Remplacé par la table `feeds` |
| `src/lib/scoring-prompts.ts` | Remplacé par les colonnes `scoring_*` de la table `topics` |
| `netlify/functions/fetch-conflict.ts` | Remplacé par `cron-fetch.ts` |
| `netlify/functions/fetch-ai.ts` | idem |
| `netlify/functions/fetch-aiengineering.ts` | idem |
| `netlify/functions/fetch-robotics.ts` | idem |
| `netlify/functions/fetch-crypto.ts` | idem |
| `netlify/functions/fetch-bitcoin.ts` | idem |
| `netlify/functions/fetch-videogames.ts` | idem |
| `netlify/functions/fetch-elon.ts` | idem |
| `netlify/functions/score-conflict.ts` | Remplacé par `cron-score.ts` |
| `netlify/functions/score-ai.ts` | idem |
| `netlify/functions/score-aiengineering.ts` | idem |
| `netlify/functions/score-robotics.ts` | idem |
| `netlify/functions/score-crypto.ts` | idem |
| `netlify/functions/score-bitcoin.ts` | idem |
| `netlify/functions/score-videogames.ts` | idem |
| `netlify/functions/score-elon.ts` | idem |

**Total** : 18 fichiers supprimés, 2 nouveaux fichiers cron créés.

---

## 8. Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `src/lib/types.ts` | Supprimer `type Topic` union et `VALID_TOPICS`. Ajouter `TopicItem`, `TopicDetail`, `FeedItem` interfaces. |
| `src/lib/i18n.ts` | Supprimer les clés `topicConflict`, `topicAi`, etc. (remplacées par BDD). Ajouter clés pour l'UI de gestion (`addTopic`, `editTopic`, `feedUrl`, etc.). |
| `src/app/page.tsx` | Supprimer constante `TOPICS` et `FEED_SITE_URL`. Charger les topics via API. Ajouter `TopicsPage` component + icône RSS dans le header. Ajouter `"topics"` à `currentPage`. Adapter `TopicToggle`, `TopicTabBar`, `StatsPage`. |
| `src/lib/supabase.ts` | Ajouter fonctions `getActiveTopics()`, `getTopicWithFeeds(id)`, `createTopic()`, `updateTopic()`, `createFeed()`, `updateFeed()`, `deleteFeed()`. |
| `src/app/api/stats/route.ts` | Remplacer `VALID_TOPICS` et `getFeedsForTopic` par requêtes BDD. |
| `netlify/functions/shared/fetch-topic.ts` | Ajouter `fetchAndStoreTopicDynamic()`. |
| `netlify/functions/shared/score-topic.ts` | Ajouter `scoreAndStoreTopicDynamic()`. |

---

## 9. Plan d'implémentation (ordre)

### Phase 1 — Base de données
1. Exécuter la migration SQL (tables `topics` + `feeds`).
2. Seeder les 8 topics et ~160 feeds existants.
3. Ajouter colonnes `last_fetched_at` et `last_scored_at` à `topics`.

### Phase 2 — API Routes
4. Créer `GET /api/topics` et `GET /api/topics/[id]`.
5. Créer `POST /api/topics`, `PATCH /api/topics/[id]`, `DELETE /api/topics/[id]`.
6. Créer `POST /api/topics/[id]/feeds`, `PATCH /api/topics/[id]/feeds/[feedId]`, `DELETE /api/topics/[id]/feeds/[feedId]`.

### Phase 3 — Crons dynamiques
7. Créer `cron-fetch.ts` et `cron-score.ts`.
8. Ajouter `fetchAndStoreTopicDynamic()` et `scoreAndStoreTopicDynamic()`.
9. Tester en local.
10. Déployer et vérifier les logs Netlify.
11. Supprimer les 16 anciens fichiers cron.

### Phase 4 — Frontend
12. Ajouter l'icône RSS dans le header et le state `currentPage = "topics"`.
13. Créer le composant `TopicsPage` avec les 3 vues (liste, détail topic, création).
14. Modifier `page.tsx` : charger topics depuis API au lieu du hardcodé.
15. Adapter tous les composants (`TopicToggle`, `TopicTabBar`, Stats).
16. Supprimer `rss-feeds.ts` et `scoring-prompts.ts`.

### Phase 5 — Nettoyage
17. Supprimer `type Topic` union, `VALID_TOPICS`, labels i18n hardcodés.
18. Mettre à jour `SPEC.md` et `spec-stats.md`.

---

## 10. Contraintes et edge cases

| Cas | Comportement |
|-----|-------------|
| Topic sans feed | Le cron fetch ne fait rien. Le topic apparaît dans l'UI avec 0 articles. |
| Feed URL invalide / timeout | Le feed est ignoré (comme actuellement). Le reste des feeds du topic est traité. |
| Suppression d'un topic | Soft delete (`is_active = false`). Les articles restent en BDD. Le topic disparaît de l'UI et des crons. |
| Slug topic dupliqué | Erreur 409 renvoyée par l'API. |
| URL feed dupliquée dans un topic | Erreur 409 renvoyée par l'API (contrainte UNIQUE). |
| Même URL feed dans 2 topics différents | Autorisé (cas courant : même blog suivi pour 2 topics). |
| Cron invoqué mais 0 topics actifs | Retourne immédiatement "No active topics". |
| 2 crons concurrents sur le même topic | Pas de problème : le fetch est idempotent (upsert sur `link`), le score est idempotent (ne re-score pas les articles déjà scorés). |
| Plus de 20 topics | Le round-robin s'adapte automatiquement. Fréquence par topic = intervalle_cron × nombre_topics. Si nécessaire, réduire l'intervalle cron. |

---

## 11. Sécurité

- **Pas d'authentification utilisateur** pour l'instant (single-user app).
- Les API de modification (POST, PATCH, DELETE) sont ouvertes. Si besoin futur : ajouter un middleware avec un token API ou cookie de session.
- Les requêtes Supabase depuis les crons utilisent `SUPABASE_SERVICE_ROLE_KEY` (full access).
- Les requêtes depuis le frontend Next.js utilisent aussi `SUPABASE_SERVICE_ROLE_KEY` (côté serveur via API routes).

---

## 12. Performance

| Opération | Temps estimé |
|-----------|-------------|
| `GET /api/topics` | < 100ms (simple SELECT + COUNT) |
| `cron-fetch` (1 topic, ~20 feeds) | 3-8s (fetch RSS en parallèle + upsert) |
| `cron-score` (1 topic, 500 articles max) | 5-12s (10 batches de 50 × OpenAI API) |
| `GET /api/stats` | 3-5s (inchangé, pagination 20k+ articles) |

Toutes les opérations cron restent **largement sous les 15 secondes** car elles ne traitent qu'un seul topic par invocation.
