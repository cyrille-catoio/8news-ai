# AGENTS.md — Conventions de travail pour 8news.ai

Ce fichier est la source de vérité pour tout agent IA travaillant sur ce repo.
Il encode les conventions du projet et les habitudes de travail du propriétaire
(développeur solo). En cas de doute, ce fichier prime sur les habitudes générales.

---

## 1. Contexte projet (résumé)

- **8news.ai** : plateforme de veille tech / IA / crypto. Deux pipelines :
  articles RSS (400+ flux, scorés 1-10 par IA) et transcriptions YouTube
  (résumés IA, roundups, podcast quotidien).
- **Stack** : Next.js 16 (App Router) + React 19 + TypeScript, Supabase
  (PostgreSQL + Auth), Netlify (hosting + 8 background functions cron),
  OpenAI, ElevenLabs (TTS), TranscriptAPI, Resend (newsletter).
- **Surfaces** : SPA noir-et-or sur `/app` (rewrites `next.config.ts`) +
  pages SSR publiques pour le SEO (`/`, `/archives`, `/[topic]/...`,
  `/{YYYY-MM-DD}`). Le détail vit dans `docs/SPEC.md` § 1.1.
- **Docs** : `docs/SPEC.md` (contrat technique, partiellement historique),
  `docs/ROADMAP.md` (Now / Next / Later), `docs/COMMITS.md` (conventions git),
  `src/data/changelog-entries.json` (changelog produit = référence la plus à jour).

## 2. Langue et communication

- **Répondre en français.** Les prompts du propriétaire sont en français,
  souvent dictés à la voix : tolérer les fautes de frappe et interpréter
  l'intention (ex. « samba » = thumbnail, « poupée » = popup, « Supabez » = Supabase).
- **Le produit est intégralement bilingue EN + FR** : tout texte UI, prompt LLM,
  email, page SSR ou entrée changelog existe dans les deux langues. Quand une
  demande ne mentionne qu'une langue, appliquer aux deux et faire soi-même une
  traduction cohérente avec le ton éditorial existant (`src/lib/i18n.ts`).
- Si une demande est ambiguë sur la surface visée (SPA `/app`, page SSR `/v/`,
  home, newsletter…), choisir l'interprétation la plus large et **dire
  explicitement quelles surfaces ont été modifiées**.

## 3. Rituel de release — « push patch / push minor / push major »

Quand le propriétaire écrit `push patch` (ou minor / major), dérouler ce rituel
complet, dans cet ordre :

1. `npm run release:patch` (ou `:minor` / `:major`) — bump `package.json` +
   propagation de la version via `scripts/release.mjs` (`public/version.json`,
   `APP_VERSION` dans `src/app/app/page.tsx`, footer landing).
2. **Ajouter une entrée changelog bilingue** en tête de
   `src/data/changelog-entries.json` :
   `{ version, title_en, title_fr, body_en, body_fr, created_at }`.
   - `version` au format compact affiché (« 2.14 », pas « 2.14.0 » ; un patch
     garde son triplet « 2.13.5 »).
   - **Vérifier que la version n'existe pas déjà** dans le tableau (consigne
     explicite du propriétaire : jamais de doublon).
   - Corps détaillé, narratif, avec les noms de fichiers/fonctions clés. Si la
     release dépend d'une migration SQL, l'indiquer dans une section « Release ».
3. **Mettre à jour `docs/SPEC.md`** selon le contrat du § 11 — sans demande
   du propriétaire, c'est une étape automatique du rituel :
   - **Toujours** (patch inclus) : en-tête (version + date) et les listes
     mécaniques touchées par la release (arbre des fichiers, migrations,
     crons, routes API). `release.mjs` affiche la liste des dérives
     détectées (`spec-check --warn`) — la traiter intégralement.
   - **Minor / major** : en plus, marqueurs `vX.Y+` dans les sections
     concernées pour les changements structurels, et un highlight en tête
     de la liste « Recent (v2.x highlights) » du § 17.
4. **Valider** : `npm test` (inclut `spec-check` en mode strict) +
   `npx tsc --noEmit` + `npm run lint` + `npm run build`.
   Ne jamais pousser si l'un des quatre échoue.
5. Commit `chore(release): v<version> — <résumé court>` puis `git push`.

Notes :
- `npm run release:sync` re-synchronise sans bump (idempotent).
- Le script `release.mjs` vérifie lui-même la couverture changelog, liste les
  commits non couverts depuis le dernier `chore(release):`, et lance
  `spec-check` en mode warning — lire et traiter ses warnings.
- Le build Netlify exécute `npm test && npm run build` : un test rouge **ou
  une dérive SPEC.md** bloque le déploiement.

## 4. Git

- **Ne jamais commit ni push sans demande explicite.** Le propriétaire dit
  « push », « commit », « push patch »… sinon on laisse le working tree tel quel.
- Conventional Commits (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`,
  `perf`…) — détails et scopes dans `docs/COMMITS.md`.
- **Refactorings multi-phases : un commit par phase** (pour pouvoir bisecter),
  push à la fin sauf consigne contraire.
- Tout part sur `main`, qui déploie la prod Netlify. Pas de branche de
  fonctionnalité à ce jour — donc chaque push est une mise en prod : valider
  d'autant plus sérieusement avant.

## 5. Validation systématique

Après toute modification de code non triviale, et avant de rendre la main :

```bash
npx tsc --noEmit   # zéro erreur TypeScript
npm run lint       # zéro erreur ESLint
npm test           # vitest (suite rapide, ~2 s)
```

`npm run build` en plus avant tout push (Netlify échouerait sinon).
Lancer le dev server avec `npm run dev` (http://127.0.0.1:3000) quand le
propriétaire dit « run localhost » ; vérifier d'abord qu'il ne tourne pas déjà.

## 6. Conventions de code (issues du cleanup v2.13.x — à ne pas re-dégrader)

- **Client Supabase serveur** : toujours `getServerClient()` de
  `src/lib/supabase/client.ts` (ré-exporté par `src/lib/supabase.ts`).
  Jamais de `createClient` inline dans une route API. Il retourne `null` si
  les env vars manquent — gérer ce cas en no-op, pas en throw.
- **Helpers API** : `src/lib/api-helpers.ts` pour `NO_STORE_HEADERS`,
  `parseLang`, `parsePositiveInt`, `parseOffset`. Routes dynamiques par
  utilisateur/query : `export const dynamic = "force-dynamic"` + `NO_STORE_HEADERS`
  (Netlify a déjà servi du cache CDN par chemin en ignorant la query string).
- **Dates** : helpers UTC de `src/lib/dates-utc.ts`. **Les crons travaillent en
  UTC**, jamais en heure locale.
- **Logging des écritures DB** : vérifier le retour des `insert`/`upsert`
  Supabase et logger les erreurs dans les `catch` (jamais de catch silencieux).
  C'est une classe de bugs déjà vécue (podcast vide en prod, latch silencieux).
- **Crons Netlify** : logging via `startCronRun()` de
  `netlify/functions/shared/cron-log.ts` — lignes émises immédiatement (pas
  bufferisées) pour survivre aux timeouts. Les crons importent la logique
  métier de `src/lib/*` via des ré-exports dans `netlify/functions/shared/`.
  Les fonctions synchrones Netlify sont limitées à ~30 s ; tout ce qui est plus
  long passe en background function (15 min) avec budget mural (`remaining()`).
  Les crons schedulés sont déclenchés par cron-job.org, protégés par `CRON_SECRET`.
- **Helpers purs** : la logique testable (parsing, tri, sélection, formatage)
  vit dans des fonctions pures, couvertes par des tests vitest colocalisés
  dans un dossier `__tests__/` (`src/lib/__tests__/`,
  `src/app/components/video-card/__tests__/`… — vitest ramasse
  `src/**/*.test.ts`). **Toute nouvelle logique de ce type doit arriver avec
  ses tests.**
- Pas de sur-ingénierie : pas d'abstraction pour un seul cas d'usage, pas de
  feature flag, pas de rétro-compatibilité spéculative.

## 7. Base de données et migrations

- **Les migrations sont manuelles** : fichiers numérotés `migrations/NNN-nom.sql`,
  exécutés par le propriétaire dans l'éditeur SQL Supabase. L'agent n'applique
  jamais une migration lui-même.
- Quand un changement nécessite une migration : créer le fichier, **fournir le
  SQL prêt à copier-coller**, et le signaler clairement (+ le mentionner dans
  l'entrée changelog, section « Release »).
- Le code est strict : depuis le retrait des latches (v2.13.x), une release
  dépendant d'une migration non appliquée échoue franchement. Toujours rappeler
  l'ordre : migration d'abord, push ensuite.
- RLS est activé sur toutes les tables publiques ; le service role key reste
  côté serveur uniquement.
- Pour les opérations de données en prod (nettoyage, ré-injection de snapshot) :
  fournir la requête SQL au propriétaire plutôt que de l'exécuter, et proposer
  un dry-run / SELECT de contrôle avant tout UPDATE/DELETE.

## 8. Secrets et environnement

- Secrets uniquement dans `.env` local (jamais commités) et dans les env vars
  Netlify. Si le propriétaire colle une clé API dans le chat, la mettre dans
  `.env` et lui rappeler de la régénérer si elle a transité en clair ailleurs.
- Variables principales : `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ELEVENLABS_API_KEY`, `TRANSCRIPT_API_KEY`, `YOUTUBE_API_KEY`,
  `RESEND_API_KEY`, `CRON_SECRET`, `ALERT_EMAIL_TO` (destinataire des
  alertes cron/watchdog — non configuré = alerting désactivé)
  (+ tunables `CRON_*`, `SCORE_*`, `TRANSCRIBE_*`,
  `VIDEO_SUMMARY_SCORE_*` — voir SPEC § env).

## 9. Conventions UI / éditorial

- **Design noir et or** : fond noir, accents dorés (encadrés, titres de
  sections, boutons « fond noir, police dorée, bord arrondi or »). Toute
  nouvelle surface doit rester cohérente avec ce thème.
- **Pas d'émojis** dans les titres et descriptions éditoriales (les titres
  YouTube sont nettoyés via `stripEmojis()` de `VideoCardHelpers.ts`).
  Ne pas ajouter d'émojis dans l'UI ni dans les sorties LLM.
- **Scores** : format « 9/10 », vert à partir de 8/10, décimale possible
  entre 9 et 10 pour les vidéos (ex. 9.3/10). Affichage homogène partout.
- « Short » YouTube = vidéo < 120 s.
- Lecteur audio : toujours surmonté du label « LECTEUR AUDIO » / « AUDIO
  PLAYER », même composant partout.
- Markdown rendu via les maps partagées (composants `react-markdown` dédupliqués
  au cleanup) — ne pas recréer de map inline.
- Mobile d'abord vérifié : le propriétaire teste beaucoup sur smartphone ;
  penser responsive (retours fréquents sur tailles de police et wrapping).
- Le podcast quotidien (Top 24h) est plafonné à **8 bullets** : 2 vidéos
  épinglées + 6 bullets articles par importance (`selectTopArticleBullets()`
  dans `generate-top-summary.ts`). Home, archives `/{date}`, newsletter et
  lecteur audio lisent les mêmes `summary_bullets` — un changement s'applique
  partout.

## 10. Plans et tâches longues

- Pour tout chantier multi-fichiers : passer par un plan (mode Plan), découpé
  en phases priorisées. Le propriétaire valide le plan puis dit de l'exécuter.
- Ne jamais éditer le fichier de plan pendant l'exécution.
- Utiliser les TODOs existants du plan (les marquer `in_progress` / `completed`
  au fil de l'eau), ne pas les recréer.
- Valider (tsc + lint + tests) à la fin de **chaque phase** avant d'enchaîner,
  et committer phase par phase.

## 11. Documentation à maintenir

- **Changelog (`src/data/changelog-entries.json`)** : obligatoire à chaque
  release (cf. § 3). C'est la mémoire du projet — y être précis.
- **`docs/SPEC.md`** : mise à jour **automatique à chaque release** (étape 3
  du rituel § 3), plus sur demande explicite (« update spec.md »). Le contrat
  de contenu — c'est lui qui fixe le bon niveau de détail :
  - **Toujours synchronisé** (mécanique, vérifié par `npm run spec:check`,
    exécuté par `npm test` donc par le build Netlify) : en-tête version +
    date, arbre des fichiers, liste des migrations, liste des crons, routes
    API, modules `src/lib` et hooks. Une mention en une ligne suffit —
    le check fait un match de sous-chaîne, pas d'exigence de paragraphe.
  - **Marqueur `vX.Y+` seulement si changement structurel** : nouvelle
    table/colonne, cron ajouté ou supprimé, nouvelle surface (page SSR,
    route API, section SPA), changement de modèle LLM, changement de
    contrat de données (ex. plafond des 8 bullets).
  - **Jamais dans le spec** : fix de bug, wording, tweak CSS, retry —
    c'est le territoire du changelog. Ne pas réécrire l'historique :
    les sections restent historisées, on ajoute des marqueurs de version.
- **`docs/ROADMAP.md`** : déplacer les items Later → Next → Now sur demande ;
  retirer un item de Now quand la release qui le couvre est poussée.
- README : garder le quick-start exact (scripts npm, env minimal).

## 12. À ne jamais faire

- Pousser ou committer sans demande explicite.
- Ajouter une entrée changelog en double pour une version existante.
- Exécuter une migration ou une écriture destructive en prod de sa propre
  initiative (fournir le SQL, laisser le propriétaire l'exécuter).
- Créer un client Supabase inline, un `catch` silencieux, ou un log bufferisé
  dans un cron.
- Introduire de l'anglais seul ou du français seul dans une surface produit
  (toujours les deux langues).
- Mettre des émojis dans l'UI ou le contenu éditorial.
- Casser le plafond des 8 bullets du podcast ou l'ordre « 2 vidéos d'abord ».
