# Plan d'optimisation des crons Netlify (13s max)

## Contexte et objectif

Nous avons 2 Scheduled Functions Netlify exécutées chaque minute :

- `netlify/functions/cron-fetch.ts`
- `netlify/functions/cron-score.ts`

Contrainte plateforme : **~13 secondes max** par invocation.

Objectif produit : garantir un enchaînement fluide pour que les articles soient scorés en **moins de 5 minutes** après leur `fetched_at` (SLA fetch -> score), même en période de charge.

---

## Cibles chiffrées (SLA/SLO)

- **Hard cap runtime** par cron : 13s Netlify.
- **Budget interne** par cron : **11.5-12.0s** (marge sécurité cold start + I/O).
- **SLA principal** : `scored_at - fetched_at < 5 min` pour au moins **95%** des articles.
- **SLO backlog** : backlog non scoré médian par topic < 100 (à ajuster après mesure).

---

## Diagnostic rapide de l'existant

- `cron-fetch` :
  - deadline interne déjà à 12s.
  - batch topics: `k = min(max(1, ceil(N/10)), 4)`.
  - mini-score post-fetch déjà présent (jusqu'à 50).
- `cron-score` :
  - deadline interne à 12s.
  - priorisation backlog + `last_fetched_at`.
  - traite possiblement plusieurs topics.
- Limite actuelle :
  - logique "best effort", mais pas encore pilotée par un budget explicite "13s platform aware" et pas de boucle de contrôle SLA `<5 min`.

---

## Stratégie globale

1. **Time-budget first** : chaque cron respecte un budget strict <= 12s.
2. **Freshness first** : priorité forte aux topics fraîchement fetchés.
3. **Micro-batches** : petites unités de scoring, arrêt propre avant timeout.
4. **Feedback loop** : KPIs minute par minute + ajustement automatique des quotas.

---

## Plan d'action (phases)

## Phase 1 - Sécuriser la contrainte 13s (immédiat)

### 1) Uniformiser les garde-fous runtime

- Ajouter/aligner des constantes :
  - `CRON_WALL_MS = 13_000`
  - `CRON_BUDGET_MS = 11_800` (ou 12_000 max)
  - `SAFETY_RESERVE_MS = 1_000-1_500`
- Dans chaque boucle topic/batch :
  - stop si `Date.now() - startedAt >= CRON_BUDGET_MS - SAFETY_RESERVE_MS`
  - retourner un message explicite `partial=true` / `[deadline]`.

### 2) Rendre `cron-fetch` plus prédictible

- Garder `k` dynamique, mais borner plus strictement en charge :
  - `kMax` configurable via env (ex: `FETCH_TOPICS_MAX_PER_RUN=3`).
- Exécuter mini-score post-fetch seulement si budget restant suffisant.
- Ne jamais lancer une étape scoring si le budget restant < timeout OpenAI + marge DB.

### 3) Rendre `cron-score` plus "budget aware"

- Micro-batches scoring (déjà 50 max) mais avec arrêt anticipé explicite.
- Prioriser les topics avec `last_fetched_at` récent (fenêtre 5 min) avant backlog profond.
- En charge : traiter moins de topics, mais terminer proprement sans kill Netlify.

---

## Phase 2 - Garantir le SLA "<5 min après fetch"

### 1) Priorité "fresh queue"

Construire une file de priorité en 3 niveaux :

1. **Fresh backlog** : topics avec articles fetchés récemment et non scorés.
2. **Backlog actif** : topics avec backlog élevé.
3. **Maintenance** : topics sans urgence.

Règle de scheduling recommandée :

- `cron-fetch` pousse le topic fraîchement traité en priorité logique pour scoring.
- `cron-score` consomme d'abord la fresh queue tant que des items <5 min existent.

### 2) Quotas de scoring adaptatifs

- Définir un quota cible par minute (ex: 40-80 articles/min selon latence observée).
- Adapter `maxArticles` dynamiquement selon :
  - budget restant,
  - latence moyenne OpenAI,
  - volume backlog.

Exemple :

- latence OpenAI stable basse -> `maxArticles` monte.
- latence haute / erreurs timeout -> `maxArticles` baisse automatiquement.

### 3) Règle anti-famine (fairness)

- Réserver une petite part du budget (ex 20%) aux topics non servis récemment.
- Empêche qu'un topic à fort débit monopolise le scoring.

---

## Phase 3 - Observabilité et pilotage automatique

### 1) KPIs indispensables

- Runtime par cron (`elapsed_ms`).
- `articles_fetched`, `articles_scored`.
- `fetch_to_score_p50/p95`.
- nombre d'arrêts deadline (`deadline_stops`).
- taux d'erreurs OpenAI (`timeout`, `rate_limit`, `parse`).

### 2) Seuils d'alerte

- Alerte si `p95(fetch_to_score) > 5 min` pendant 10 min.
- Alerte si `deadline_stops` > X/min.
- Alerte si `scored/fetched` < 1 de façon persistante.

### 3) Boucle d'auto-ajustement

- Toutes les 15 min, recalculer :
  - `kMax` fetch,
  - `maxArticles` score,
  - seuil multi-topic.
- Objectif : rester sous 12s tout en minimisant la latence fetch->score.

---

## Changements techniques recommandés (concrets)

## A) `cron-fetch.ts`

- Conserver `FETCH_DEADLINE_MS` <= 12_000.
- Introduire `budgetRemaining()` utilitaire.
- Mini-score post-fetch seulement si `budgetRemaining >= SCORE_STEP_MIN_MS`.
- Rendre `kMax` configurable par env.
- Log structuré par topic :
  - `topic_id`, `fetched`, `inserted`, `mini_scored`, `elapsed_ms`.

## B) `cron-score.ts`

- Tri prioritaire : freshness (`last_fetched_at récent`) puis backlog.
- Stop propre avant dépassement budget.
- Mettre à jour `last_scored_at` après tentative (et pas seulement en entrée) pour signaler l'activité réelle.
- Ajouter un mode "burst fresh" :
  - si fresh backlog existe, consommer un maximum de micro-batches fresh avant backlog ancien.

## C) `score-topic-dynamic.ts`

- Exposer un mode `maxElapsedMs` (optionnel) pour arrêter les batches proprement côté lib.
- Retourner un résultat structuré :
  - `scored`, `candidateCount`, `partial`, `elapsed_ms`, `errors`.

## D) Paramètres d'env (proposés)

- `CRON_BUDGET_MS=11800`
- `CRON_SAFETY_RESERVE_MS=1200`
- `FETCH_TOPICS_MAX_PER_RUN=3`
- `FETCH_MINI_SCORE_MAX=50`
- `SCORE_MAX_ARTICLES_PER_RUN=50` (adaptatif ensuite)
- `SCORE_FRESH_WINDOW_MIN=5`

---

## Plan de déploiement

1. **Release A (safe)** : instrumentation + budgets stricts 13s (sans gros changement d'algo).
2. **Release B** : priorité fresh queue + quotas adaptatifs.
3. **Release C** : auto-tuning périodique et alerting complet.

Rollback simple :

- revenir à quotas statiques actuels si augmentation d'erreurs,
- garder instrumentation active pour diagnostiquer.

---

## Validation (acceptance checklist)

- [ ] Aucun timeout Netlify observé sur 24h.
- [ ] `p95(fetch_to_score) < 5 min` sur 24h.
- [ ] `cron-fetch` et `cron-score` restent < 12s dans >99% des runs.
- [ ] Le backlog total décroît après pics de publication.
- [ ] Aucun topic n'est affamé (>30 min sans scoring alors que backlog > 0).

---

## Résumé exécutif

Le point clé est de piloter les deux crons avec une logique **time-budget stricte (13s)**, puis d'orienter la priorité scoring vers les articles fraîchement fetchés.  
Avec micro-batches, arrêt anticipé propre, et quotas adaptatifs, on peut stabiliser Netlify et atteindre l'objectif de **scoring < 5 min** dans la grande majorité des cas.

