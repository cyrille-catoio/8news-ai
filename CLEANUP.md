# Plan de clean-up global — 8news

> **Statut** : sections **1**–**7** exécutées (`TopicLabel`, `ChangelogEntry`, `FeedAdminRow` dans `types.ts`).
> À exécuter section par section pour la suite (8+), du plus impactant au moins impactant.

---

## 1. Dépendances inutilisées — `package.json`

### Tailwind CSS non utilisé

Tailwind est installé (`tailwindcss`, `@tailwindcss/postcss`) mais **aucune classe utilitaire Tailwind n'est utilisée**. Les `className` dans `page.tsx` pointent vers des classes CSS custom injectées via des balises `<style>`, pas vers Tailwind.

**Action** : supprimer les deux packages.

```bash
npm uninstall tailwindcss @tailwindcss/postcss
```

Supprimer aussi `postcss.config.*` si il n'existe que pour Tailwind.

---

## 2. Fichiers de documentation obsolètes — racine du projet

Il existe **10 fichiers `.md`** à la racine. `SPEC.md` est la source de vérité maintenue. Les autres sont des specs partielles d'anciennes fonctionnalités, désormais toutes documentées dans SPEC.md.

| Fichier | Statut |
|---------|--------|
| `SPEC.md` | ✅ Conserver — source de vérité |
| `README.md` | ✅ Conserver |
| `CRON_ANALYSIS.md` | ✅ Conserver (analyse récente, utile) |
| `spec-article-selection.md` | 🗑 Supprimer — couvert par SPEC §6.2 |
| `spec-cron-monitor.md` | 🗑 Supprimer — couvert par SPEC §8.5 |
| `spec-feed.md` | 🗑 Supprimer — couvert par SPEC §8.7 |
| `spec-max-articles.md` | 🗑 Supprimer — couvert par SPEC §8.9 |
| `spec-prompts.md` | 🗑 Supprimer — couvert par SPEC §7 |
| `spec-stats.md` | 🗑 Supprimer — couvert par SPEC §8.4 |
| `spec-topic-order.md` | 🗑 Supprimer — couvert par SPEC §8.6 |
| `spec-topics.md` | 🗑 Supprimer — couvert par SPEC §8.6 |

**Action** : supprimer les 7 fichiers `spec-*.md`.

---

## 3. Code dupliqué entre routes API et fonctions Netlify partagées

### 3.1 `fetch-feeds/route.ts` duplique `shared/fetch-topic.ts`

`src/app/api/fetch-feeds/route.ts` contient ~120 lignes de logique RSS fetch+upsert qui sont une copie quasi-identique de `netlify/functions/shared/fetch-topic.ts`. La route accepte un paramètre `secret` pour un usage manuel admin.

**Action** : faire en sorte que `fetch-feeds/route.ts` appelle `fetchAndStoreTopicDynamic()` depuis le module partagé au lieu de dupliquer la logique. Si la route n'est plus utilisée du tout (elle est doublée par `/api/topics/[id]/discover-feeds`), **la supprimer**.

### 3.2 `test-score/route.ts` duplique `shared/score-topic.ts`

`src/app/api/test-score/route.ts` (~200 lignes) reconstruit manuellement le prompt de scoring et la logique de batch OpenAI, code déjà présent dans `netlify/functions/shared/score-topic.ts`.

**Action** : faire appel à `scoreAndStoreTopicDynamic()` ou extraire la partie prompt vers un module partagé. Si la route n'est appelée nulle part dans l'UI (c'est un endpoint de debug admin), vérifier et **la supprimer si non utilisée**.

---

## 4. Fonctions dupliquées dans `page.tsx`

### 4.1 Fonctions de coloration dupliquées

Deux fonctions de coloration de coverage existent dans le même fichier :

| Fonction | Ligne | Utilisée dans |
|----------|-------|---------------|
| `covClr` | ~1770 | StatsPage |
| `feedAdminCovClr` | ~485 | FeedsAdminPage |

Les deux ont la même logique (seuils identiques, couleurs identiques). De même, `scoreClr` et `hitClr` sont définies localement.

**Action** : déplacer ces 4 fonctions dans `src/lib/theme.ts` et les importer là où elles sont utilisées. *(Fait — seuils et couleurs alignés sur l’UI : `covClr` 90/70 %, `hitClr` 50/30 %, `scoreClr` paliers 7/5/3.)*

---

## 5. Utilitaire cookie dupliqué 5 fois dans `page.tsx`

Le pattern de lecture de cookie apparaît ~5 fois dans les `useEffect` d'initialisation :

```typescript
// Répété 5 fois avec des variantes
const match = document.cookie.match(/(?:^|; )cookieName=([^;]*)/);
```

**Action** : créer `src/lib/cookies.ts` *(fait — échappement du nom pour la RegExp, `decodeURIComponent` avec repli si ancien cookie non encodé, `setCookie` conserve `SameSite=Lax` comme avant)*.

---

## 6. Styles répétés — extraire vers `theme.ts` ou `globals.css`

### 6.1 Spinner inline répété 6+ fois

**Action** : `spinnerStyle(size, opts?)` dans `theme.ts` ; `@keyframes spin` dans `globals.css`. Composant `SpinKeyframes` supprimé.

### 6.2 Style de bouton fantôme répété 10+ fois

**Action** : `ghostBtn` (texte minimal) et `ghostOutlineBtn` (bordure, panneau Topics) dans `theme.ts`.

### 6.3 Classes CSS custom (`<style>`) dupliquées

**Action** : tables / grilles / `period-btn` / `summary-meta-line` / point pulse cron → `globals.css` ; grille topics avec `--topic-grid-cols` en style inline sur le conteneur `.topic-grid`.

---

## 7. Types définis au mauvais endroit dans `page.tsx`

**Fait** : `TopicLabel`, `ChangelogEntry`, `FeedAdminRow` exportés depuis `src/lib/types.ts` et importés dans `page.tsx`.

---

## 8. Découper `page.tsx` (3 753 lignes)

`page.tsx` est un fichier monolithique de 3 753 lignes contenant l'intégralité de l'UI. C'est le chantier le plus conséquent mais aussi le plus bénéfique pour la maintenabilité.

### Composants à extraire

| Composant / Section | Lignes approx. | Fichier cible |
|--------------------|---------------|---------------|
| `ChangelogPage` | 402–463 | `src/app/components/ChangelogPage.tsx` |
| `FeedsAdminPage` | 496–1028 | `src/app/components/FeedsAdminPage.tsx` |
| `SettingsPage` | 1029–1186 | `src/app/components/SettingsPage.tsx` |
| `AudioPlayer` | 1187–1433 | `src/app/components/AudioPlayer.tsx` |
| `SummaryBox` | 1463–1570 | `src/app/components/SummaryBox.tsx` |
| `AllArticlesTab` | 1571–1696 | `src/app/components/AllArticlesTab.tsx` |
| `CopyLinkButton` | ~388 | `src/app/components/CopyLinkButton.tsx` |
| `StatsPage` | 1773–2200 | `src/app/components/StatsPage.tsx` |
| `CronMonitorPage` | 2200–2408 | `src/app/components/CronMonitorPage.tsx` |
| `TopicsPage` | 2408–3090 | `src/app/components/TopicsPage.tsx` |

**Résultat attendu** : `page.tsx` réduit à ~400 lignes (layout, routage entre pages, état partagé).

> ⚠️ Ce découpage est le plus risqué : il faut propager l'état partagé (`lang`, `topics`, `currentPage`, etc.) via props ou un contexte React. À faire en dernier, après les nettoyages sans risque.

---

## 9. Icônes SVG inline répétées

Les SVGs des icônes de navigation (home, stats, topics, feeds, crons, changelog, settings) sont définis inline directement dans le JSX du header. Chaque SVG fait ~5–10 lignes.

**Action** : créer `src/app/components/Icons.tsx` avec des composants nommés :

```typescript
export const HomeIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">...</svg>
);
// etc.
```

---

## 10. Ordre d'exécution recommandé

| Priorité | Section | Risque | Effort |
|----------|---------|--------|--------|
| 🔴 1 | Supprimer `tailwindcss` + `@tailwindcss/postcss` | Nul | 5 min |
| 🔴 2 | Supprimer les `spec-*.md` | Nul | 2 min |
| 🟡 3 | Extraire fonctions couleur vers `theme.ts` | Faible | 30 min |
| 🟡 4 | Créer `src/lib/cookies.ts` | Faible | 20 min |
| 🟡 5 | Extraire `spinnerStyle` + `ghostBtn` dans `theme.ts` | Faible | 20 min |
| 🟡 6 | Déplacer types `ChangelogEntry`, `FeedAdminRow` vers `types.ts` | Faible | 15 min |
| 🟡 7 | Consolider les blocs `<style>` dans `globals.css` | Moyen | 45 min |
| 🟠 8 | Supprimer / refactorer `fetch-feeds/route.ts` et `test-score/route.ts` | Moyen | 1 h |
| 🔵 9 | Extraire composants SVG icônes | Faible | 30 min |
| 🔵 10 | Découper `page.tsx` en composants | Élevé | 4–6 h |
