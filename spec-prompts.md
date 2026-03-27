# spec-prompts.md — Dynamic Analysis Prompts (DB-driven)

> Version: 1.0 — March 2026
> Status: SPEC (not implemented)

---

## 1. Objectif

Migrer les prompts d'analyse (fichier `src/lib/prompts.ts`) vers la base de données Supabase afin de :

1. Permettre à l'utilisateur de **modifier les prompts** d'un topic existant depuis la page Topics.
2. Permettre de **créer un prompt EN + FR** lors de la création d'un nouveau topic.
3. Rendre le endpoint `/api/news` entièrement **dynamique** (plus aucune dépendance à un fichier hardcodé).
4. Supprimer le fichier `src/lib/prompts.ts` après migration.

---

## 2. Contexte — structure actuelle des prompts

### 2.1 Rôle du prompt d'analyse

Chaque prompt est utilisé par `/api/news` pour demander à GPT-4.1-nano de :

1. **FILTRER** les articles pertinents pour un topic donné.
2. **RÉSUMER** chaque article retenu (2-3 phrases).
3. **PRODUIRE UN RÉSUMÉ GLOBAL** (jusqu'à 8 bullet points factuels avec chiffres).

Le prompt est le **system message** envoyé à l'API OpenAI. Le **user message** contient la liste d'articles formatée.

### 2.2 Structure d'un prompt

Chaque prompt suit un template commun avec des **sections variables** selon le topic :

```
[RÔLE]        → Description de l'expertise (ex: "You are a tech journalist specializing in AI")
[FILTER]      → Critères d'inclusion/exclusion spécifiques au topic
[SUMMARIZE]   → Consignes de résumé avec métriques spécifiques à inclure
[GLOBAL]      → Consignes pour les bullet points avec types de chiffres attendus
[MAX]         → Instruction sur le nombre d'articles à sélectionner (variable : {{max}})
[JSON FORMAT] → Format de réponse JSON (identique pour tous les prompts)
```

### 2.3 Variable dynamique

Chaque prompt contient un placeholder `{{max}}` (actuellement `${max}` dans le code JS) qui est remplacé à l'exécution par le nombre max d'articles sélectionné par l'utilisateur (paramètre `count` de `/api/news`).

### 2.4 Inventaire actuel

| Topic | EN | FR | Longueur moyenne |
|-------|----|----|-----------------|
| conflict | `conflictEn(max)` | `conflictFr(max)` | ~1200 chars |
| ai | `aiEn(max)` | `aiFr(max)` | ~1200 chars |
| crypto | `cryptoEn(max)` | `cryptoFr(max)` | ~1300 chars |
| robotics | `roboticsEn(max)` | `roboticsFr(max)` | ~1300 chars |
| bitcoin | `bitcoinEn(max)` | `bitcoinFr(max)` | ~1400 chars |
| videogames | `videogamesEn(max)` | `videogamesFr(max)` | ~1200 chars |
| aiengineering | `aiengineeringEn(max)` | `aiengineeringFr(max)` | ~1800 chars |
| elon | `elonEn(max)` | `elonFr(max)` | ~1400 chars |

**Total** : 16 prompts (8 topics × 2 langues).

---

## 3. Modification de la table `topics`

### 3.1 Nouvelles colonnes

Ajout de 2 colonnes `TEXT` à la table `topics` existante :

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `prompt_en` | `text` | NOT NULL DEFAULT '' | Prompt d'analyse en anglais (template avec `{{max}}`) |
| `prompt_fr` | `text` | NOT NULL DEFAULT '' | Prompt d'analyse en français (template avec `{{max}}`) |

**Pas de nouvelle table** — les prompts sont intrinsèquement liés 1:1 à un topic. Les stocker dans la même table évite les jointures et simplifie le CRUD.

### 3.2 Pourquoi `{{max}}` et non `${max}`

Le template utilise `{{max}}` comme placeholder plutôt que `${max}` pour :
- Éviter toute interprétation JavaScript lors du stockage/affichage.
- Utiliser un format de template explicite et sans ambiguïté.
- Faciliter le remplacement côté serveur avec un simple `String.replace`.

---

## 4. Migration SQL

```sql
-- 4.1 Ajouter les colonnes
ALTER TABLE topics ADD COLUMN IF NOT EXISTS prompt_en text NOT NULL DEFAULT '';
ALTER TABLE topics ADD COLUMN IF NOT EXISTS prompt_fr text NOT NULL DEFAULT '';

-- 4.2 Seed les prompts des 8 topics existants
-- (Chaque UPDATE insère le prompt complet extrait de prompts.ts,
--  avec ${max} remplacé par {{max}})

UPDATE topics SET prompt_en = '...', prompt_fr = '...' WHERE id = 'conflict';
UPDATE topics SET prompt_en = '...', prompt_fr = '...' WHERE id = 'ai';
UPDATE topics SET prompt_en = '...', prompt_fr = '...' WHERE id = 'crypto';
UPDATE topics SET prompt_en = '...', prompt_fr = '...' WHERE id = 'robotics';
UPDATE topics SET prompt_en = '...', prompt_fr = '...' WHERE id = 'bitcoin';
UPDATE topics SET prompt_en = '...', prompt_fr = '...' WHERE id = 'videogames';
UPDATE topics SET prompt_en = '...', prompt_fr = '...' WHERE id = 'aiengineering';
UPDATE topics SET prompt_en = '...', prompt_fr = '...' WHERE id = 'elon';
```

Le script complet doit contenir les 16 prompts intégralement (extraits de `prompts.ts` avec `${max}` → `{{max}}`).

---

## 5. Modifications API

### 5.1 `GET /api/topics/[id]` — ajouter les prompts à la réponse

Le endpoint existant retourne déjà un `TopicDetail`. Il suffit d'ajouter les 2 champs :

```json
{
  "id": "conflict",
  "labelEn": "Iran War",
  "labelFr": "Iran War",
  "scoringDomain": "...",
  "scoringTier1": "...",
  ...
  "promptEn": "You are a news analyst. Your task:\n\n1. FILTER: ...\n\n{{max}}...",
  "promptFr": "Tu es un analyste de presse. Ta tâche :\n\n1. FILTRER : ...",
  "feeds": [...]
}
```

### 5.2 `POST /api/topics` — accepter les prompts à la création

**Body enrichi** :

```json
{
  "id": "space",
  "labelEn": "Space",
  "labelFr": "Espace",
  "scoringDomain": "...",
  "scoringTier1": "...", ...,
  "promptEn": "You are a space journalist...",
  "promptFr": "Tu es un journaliste spatial..."
}
```

**Validation** :
- `promptEn` : optionnel à la création. Si absent, un **prompt par défaut** est généré automatiquement (voir §5.4).
- `promptFr` : optionnel à la création. Si absent, un **prompt par défaut** est généré automatiquement.
- Longueur max : 5000 caractères par prompt.
- Le placeholder `{{max}}` doit être présent dans le prompt (avertissement côté client si absent, mais pas bloquant côté serveur).

### 5.3 `PATCH /api/topics/[id]` — permettre la mise à jour des prompts

Le endpoint existant accepte déjà les champs partiels. Ajouter `promptEn` et `promptFr` à la map camelCase → snake_case :

```typescript
const allowed: Record<string, string> = {
  // ... champs existants ...
  promptEn: "prompt_en",
  promptFr: "prompt_fr",
};
```

### 5.4 Génération automatique d'un prompt par défaut

Quand l'utilisateur crée un topic sans fournir de prompt, le backend génère un prompt par défaut basé sur le `labelEn`/`labelFr` et le `scoringDomain` :

```typescript
function generateDefaultPromptEn(label: string, domain: string, max: string): string {
  return `You are a news analyst specializing in ${domain}. Your task:

1. FILTER: From the article list below, identify ONLY articles about ${label.toLowerCase()}. Exclude unrelated news.

2. SUMMARIZE EACH: For every relevant article, write a factual 2–3 sentence summary in English. Cover the key facts: who, what, where, when, and why. Include specific details: names, numbers, dates.

3. GLOBAL SUMMARY: Write up to 8 bullet points summarizing the latest developments based on the relevant articles. 8 is a maximum target — if fewer noteworthy points exist, only write those. Each bullet point must start with "• " and be on its own line. Include specific numbers and figures. Never write vague bullets.

IMPORTANT: Try to select approximately ${max} relevant articles. If fewer are truly relevant, return only those. If more are relevant, pick the ${max} most important and diverse ones.

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
```

Le même principe pour la version FR (avec traduction du titre et des consignes de résumé en français).

Le placeholder `{{max}}` est intégré dans le template par défaut.

---

## 6. Modification de `/api/news/route.ts`

### 6.1 Changement principal

Remplacer :
```typescript
import { getSystemPrompt } from "@/lib/prompts";
// ...
content: getSystemPrompt(topic, lang, maxArticles)
```

Par :
```typescript
// Fetch the topic's prompt from DB
const { data: topicRow } = await supabase
  .from("topics")
  .select("prompt_en, prompt_fr")
  .eq("id", topic)
  .single();

const promptTemplate = lang === "fr" ? topicRow.prompt_fr : topicRow.prompt_en;
const systemPrompt = promptTemplate.replace(/\{\{max\}\}/g, String(maxArticles));
// ...
content: systemPrompt
```

### 6.2 Fallback

Si le prompt est vide (topic créé sans prompt, ou migration incomplète), utiliser le **prompt par défaut** généré dynamiquement (§5.4).

### 6.3 Suppression de `VALID_TOPICS`

Le endpoint `/api/news` utilise actuellement `VALID_TOPICS` pour valider le paramètre `topic`. Après migration, cette validation doit vérifier l'existence du topic en BDD :

```typescript
// Avant
const topic: Topic = rawTopic && VALID_TOPICS.includes(rawTopic) ? rawTopic : "conflict";

// Après
const { data: topicRow } = await supabase
  .from("topics")
  .select("id, prompt_en, prompt_fr")
  .eq("id", rawTopic)
  .eq("is_active", true)
  .single();

if (!topicRow) {
  return NextResponse.json({ error: "Invalid topic" }, { status: 400 });
}
```

Cela permet d'accepter n'importe quel topic créé par l'utilisateur, pas seulement les 8 topics originaux.

---

## 7. Modifications Frontend (TopicsPage)

### 7.1 Vue détail — affichage des prompts

Dans la vue détail d'un topic (`view === "detail"`), ajouter une **section Prompts** en dessous de la section "Topic Info" :

```
┌──────────────────────────────────────────────────┐
│  ← Retour    Iran War                            │
├──────────────────────────────────────────────────┤
│  Info topic                          [Modifier]  │
│  Label EN: Iran War     Label FR: Iran War       │
│  Domain: Iran/USA/Israel conflict and...         │
├──────────────────────────────────────────────────┤
│  Analysis Prompt                     [Modifier]  │
│  ┌─ EN ──┐  ┌─ FR ──┐                           │
│  │ active │  │       │   ← Tab toggle            │
│  ┌──────────────────────────────────────────┐    │
│  │ You are a news analyst. Your task:       │    │
│  │                                          │    │
│  │ 1. FILTER: From the article list below,  │    │
│  │ identify ONLY articles about the         │    │
│  │ conflict or tensions between ...         │    │
│  │                                          │    │
│  │ (scrollable textarea, max-height 300px)  │    │
│  └──────────────────────────────────────────┘    │
├──────────────────────────────────────────────────┤
│  Feeds (20)                       [+ Add Feed]   │
│  ...                                             │
└──────────────────────────────────────────────────┘
```

**Comportement** :
- Par défaut, le prompt est affiché en lecture seule dans un `<pre>` stylisé (fond sombre, scroll vertical, max-height 300px).
- Bouton « Modifier » → bascule en mode édition : le `<pre>` devient un `<textarea>` (min-height 200px, resize vertical).
- Toggle EN / FR permet de basculer entre les deux prompts.
- Bouton « Sauvegarder » → `PATCH /api/topics/[id]` avec `{ promptEn, promptFr }`.
- Bouton « Annuler » → retour au mode lecture sans sauvegarder.
- **Indicateur `{{max}}`** : un petit badge sous le textarea indique "Le placeholder `{{max}}` sera remplacé par le nombre d'articles sélectionné par l'utilisateur." Si `{{max}}` est absent du prompt, afficher un avertissement (texte orange).

### 7.2 Vue création — champs prompt optionnels

Dans le formulaire de création de topic (`view === "create"`), ajouter une **section Prompts** après les critères de scoring :

```
┌──────────────────────────────────────────────────┐
│  ← Retour    New Topic                           │
├──────────────────────────────────────────────────┤
│  Slug, Labels EN/FR                              │
│  Scoring criteria (domain + 5 tiers)             │
├──────────────────────────────────────────────────┤
│  Analysis Prompt (optional)                      │
│  ┌─ EN ──┐  ┌─ FR ──┐                           │
│  │ active │  │       │                           │
│  ┌──────────────────────────────────────────┐    │
│  │ Leave empty to auto-generate a default   │    │
│  │ prompt based on your topic name and      │    │
│  │ scoring domain.                          │    │
│  │                                          │    │
│  │ (textarea, placeholder text)             │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│              [Créer le topic]                    │
└──────────────────────────────────────────────────┘
```

**Comportement** :
- Les champs `promptEn` / `promptFr` sont des `<textarea>` optionnels.
- **Placeholder** : "Leave empty to auto-generate a default prompt based on your topic name and scoring domain."
- Si laissés vides, le backend génère les prompts par défaut (§5.4).
- Si remplis, les valeurs sont envoyées telles quelles au backend.

### 7.3 Page Settings — section AI Prompt

La section "AI Prompt" dans Settings affiche actuellement le prompt via `getSystemPrompt()` (fichier hardcodé). Après migration :

- Remplacer l'appel à `getSystemPrompt(activeTab, lang, maxArticles)` par un fetch de `/api/topics/[id]` pour récupérer le prompt depuis la BDD.
- Appliquer le remplacement `{{max}}` → valeur réelle côté client pour l'aperçu.
- Ou bien : **supprimer cette section de Settings** puisque le prompt est désormais visible et éditable dans TopicsPage. (Option recommandée pour éviter la duplication.)

---

## 8. Types TypeScript

### 8.1 Modification de `TopicDetail`

```typescript
export interface TopicDetail {
  id: string;
  labelEn: string;
  labelFr: string;
  scoringDomain: string;
  scoringTier1: string;
  scoringTier2: string;
  scoringTier3: string;
  scoringTier4: string;
  scoringTier5: string;
  promptEn: string;    // ← nouveau
  promptFr: string;    // ← nouveau
  isActive: boolean;
  sortOrder: number;
  feeds: FeedItem[];
}
```

### 8.2 Modification de `TopicRow` (supabase.ts)

```typescript
export interface TopicRow {
  // ... colonnes existantes ...
  prompt_en: string;   // ← nouveau
  prompt_fr: string;   // ← nouveau
}
```

---

## 9. Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `src/lib/types.ts` | Ajouter `promptEn`, `promptFr` à `TopicDetail` |
| `src/lib/supabase.ts` | Ajouter `prompt_en`, `prompt_fr` à `TopicRow`. Ajouter `getTopicPrompt(id)`. |
| `src/app/api/topics/route.ts` | Accepter `promptEn`/`promptFr` dans POST, générer défaut si absent |
| `src/app/api/topics/[id]/route.ts` | Inclure `promptEn`/`promptFr` dans GET, accepter dans PATCH |
| `src/app/api/news/route.ts` | Remplacer `getSystemPrompt()` par lecture BDD. Supprimer `import { VALID_TOPICS }`. Valider topic via BDD. |
| `src/app/page.tsx` | Ajouter section Prompts dans TopicsPage (détail + création). Supprimer AI Prompt de SettingsPage. |
| `src/lib/i18n.ts` | Ajouter clés : `analysisPrompt`, `promptPlaceholder`, `promptMissingMax`, `autoGenerated` |

## 10. Fichiers à supprimer après migration

| Fichier | Raison |
|---------|--------|
| `src/lib/prompts.ts` | Remplacé par les colonnes `prompt_en` / `prompt_fr` de la table `topics` |

---

## 11. Plan d'implémentation

### Phase 1 — Base de données + API (backend)
1. Script SQL : `ALTER TABLE` + seed des 16 prompts.
2. Modifier `TopicRow`, `TopicDetail` (types).
3. Modifier `supabase.ts` : ajouter `getTopicPrompt()`.
4. Modifier `POST /api/topics` : accepter prompts, générer défaut si absent.
5. Modifier `PATCH /api/topics/[id]` : accepter `promptEn`/`promptFr`.
6. Modifier `GET /api/topics/[id]` : inclure prompts dans la réponse.
7. Modifier `/api/news/route.ts` : lecture prompt depuis BDD, suppression `VALID_TOPICS`, suppression import `prompts.ts`.

### Phase 2 — Frontend
8. TopicsPage vue détail : section Prompts (lecture + édition, toggle EN/FR).
9. TopicsPage vue création : champs prompt optionnels.
10. Supprimer section "AI Prompt" de SettingsPage.
11. Ajouter clés i18n.

### Phase 3 — Nettoyage
12. Supprimer `src/lib/prompts.ts`.
13. Supprimer `type Topic` union et `VALID_TOPICS` de `types.ts` (si plus utilisés nulle part).
14. Supprimer import `getSystemPrompt` de `page.tsx`.

---

## 12. Contraintes et edge cases

| Cas | Comportement |
|-----|-------------|
| Topic créé sans prompt | Le backend génère un prompt par défaut basé sur `label_en`/`label_fr` + `scoring_domain` |
| Prompt sans `{{max}}` | Fonctionne mais sans contrôle du nombre d'articles. Avertissement affiché côté client (non bloquant). |
| Prompt vide en BDD | Fallback vers le prompt par défaut généré dynamiquement |
| Prompt très long (>5000 chars) | Rejeté par l'API avec erreur 400 |
| Topic original avec prompt modifié | Le prompt modifié est utilisé. L'ancien prompt hardcodé n'est plus consulté. |
| Caractères spéciaux dans le prompt | Stockés tels quels en TEXT. Pas d'échappement nécessaire côté BDD. Les `\n` sont stockés littéralement. |
| Migration incomplète (colonne existe, seed pas fait) | Le DEFAULT '' déclenche le fallback vers le prompt par défaut |

---

## 13. Performance

| Opération | Impact |
|-----------|--------|
| `/api/news` | +1 requête Supabase légère (`SELECT prompt_en, prompt_fr FROM topics WHERE id = $1`). Temps : <50ms. Négligeable par rapport au call OpenAI (~3-5s). |
| `/api/topics/[id]` | Aucun impact — les colonnes TEXT sont déjà lues dans le SELECT * existant. |
| Taille BDD | +~40 KB total (16 prompts × ~2500 chars moyens). Négligeable. |
