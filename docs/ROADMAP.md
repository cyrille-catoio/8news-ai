# Roadmap

> Source unique des grandes lignes de développement à venir. Vit dans le repo
> pour rester en lockstep avec le code (cf. [`SPEC.md`](SPEC.md) pour le
> contrat technique courant et [`src/data/changelog-entries.json`](src/data/changelog-entries.json)
> pour ce qui est déjà livré).
>
> **Convention** :
> - On déplace un item de `Later` → `Next` → `Now` quand on s'engage à le faire.
> - On le supprime de `Now` quand le commit `chore(release):` qui le couvre
>   est mergé sur `main` (le détail vit alors dans le changelog).
> - Max ~10 items par section pour rester scannable.

---

## Now — sprint courant

> Ce sur quoi on travaille MAINTENANT. Devrait tenir sur 1 à 2 semaines.

- [ ] **`robots.txt`** via `src/app/robots.ts` (base SEO manquante, cf. SPEC §SEO).
- [ ] **ISR explicite** (`export const revalidate`) sur `/v/`, `/r/`, `/{topic}/{date}/{slug}` — la SSR est déjà là (`v2.0` + `v2.2`), il manque juste la revalidation.
- [ ] **Implémentation réelle de l'alerte email « article score = 10 »** — la copy Pro est annoncée depuis `v2.5.5`, le cron + transactional email pas encore câblés.
- [ ] **Seed des 5 topics manquants** : `deepseek`, `nvidia`, `ai-agents`, `cursor` (AI coding), `spacex` — migration courte + prompts auto-générés.

---

## Next — 1 à 3 mois

> Le « prochain » bloc. Les items ici sont validés (pas juste des idées) mais
> pas encore commencés. Ordre = priorité décroissante.

- [ ] **Newsletter email matinale** (Resend ou Loops + table `subscribers`) — reprend les topics de l'utilisateur.
- [ ] **Consolidation cross-source** : regrouper les doublons en événements uniques (embeddings + clustering, ou batch LLM au write time).
- [ ] **Glossaire AI auto-généré** (MoE, RLHF, RAG, etc.) → long-tail SEO massif, génération via cron + page SSR `/glossary/{term}`.
- [ ] **Recherche full-text historique** sur `articles` + `summary_bullets` (PG `tsvector` + UI Pro).
- [ ] **Mode « Catch-up »** : rattrapage condensé après 3 j / 1 semaine d'absence (réutilise `daily_summaries`).
- [ ] **Onboarding personnalisé post-signup** : flow guidé pour choisir les 8 topics (la table `user_topic_preferences` existe déjà depuis migration `007`).
- [ ] **Alertes temps réel articles ≥ 9/10** (extension naturelle de l'alerte `=10` du Now).
- [ ] **Podcast personnel quotidien** livré via flux RSS privé (ElevenLabs, réutilise la pipeline TTS existante).
- [ ] **Bookmarks « Read later »** + relance follow-up à 7 jours (les favoris existent depuis migration `010`, ajoute juste l'état `read_later` + le cron de relance).
- [ ] **PWA + push notifications** (manifest + service worker + lien aux alertes ci-dessus).

---

## Later — idées en attente

> Idées non encore validées. Peuvent être promues vers `Next` ou abandonnées.
> Pas besoin de les ranger par priorité — on trie au moment de la promotion.

- [ ] Briefings hebdomadaires + mensuels (trends, recurring entities, contradictions).
- [ ] RAG sur archives — « pose une question à tes archives ».
- [ ] Audio MP3 extrait des vidéos + chapitrage AI.
- [ ] Timeline d'un sujet sur 30 j (narration chronologique générée à la demande).
- [ ] Score de crédibilité par source (avg score historique, % articles ≥ 7).
- [ ] Vue « Signal vs Noise » : filtres breaking only / analyse only / contrarian takes.
- [ ] Alertes mots-clés transverses (ex : BCE, Anthropic) tous topics confondus.
- [ ] API publique read-only gratuite (rate-limited) — pose la base pour la version payante.
- [ ] Widgets embed (`<iframe>` ou snippet JS) pour blogs/sites tech → backlinks SEO.
- [ ] White-label entreprises (~200-500 €/mois) : instance dédiée avec topics custom.

---

## Notes & contraintes long-terme

> Hors-roadmap : décisions structurantes qui contraignent les futurs choix
> (ex : « pas de framework UI lourd avant 1000 MAU », « rester compatible
> Netlify free tier », etc.). À garder court.

- Rester compatible Netlify free tier : 30 s sur les routes synchrones, 15 min sur les background functions, ne pas multiplier les crons sans nécessité.
- **UTC partout** sur la couche data + crons (alignement acté en `v2.5.9`). Tout calcul de fenêtre `yesterday` / `today` passe par `yesterdayUtc()` ou les bornes UTC `[start, end)`, plus jamais par la timezone serveur.
- Pas de framework UI lourd avant 1000 MAU — on reste sur Next App Router + composants maison.
- **Bilingue FR/EN systématique** : toute nouvelle UI, page SSR, route API ou clé i18n doit avoir ses deux versions dès le commit qui l'introduit (cf. `src/lib/i18n.ts`).
- **Migrations SQL versionnées** dans `/migrations/`, idempotentes (`IF NOT EXISTS`), appliquables manuellement dans Supabase. On documente les colonnes ajoutées dans `SPEC.md` §5 et on évite les safety latches longue durée dans le code (cf. `v2.5.11`).
- **SEO-first** sur tout nouveau contenu indexable (slug stable, canonical, hreflang, JSON-LD, présence dans `sitemap.xml` avec cap 90 j).

---

## Done

Les releases livrées sont documentées dans
[`src/data/changelog-entries.json`](src/data/changelog-entries.json) (entrée par
version, FR + EN, body détaillé). Pas de double tracking ici.
