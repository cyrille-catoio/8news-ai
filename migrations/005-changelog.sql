-- Migration 005: Create changelog table for update logs
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS changelog (
  id          serial PRIMARY KEY,
  version     text NOT NULL,
  title_en    text NOT NULL,
  title_fr    text NOT NULL,
  body_en     text NOT NULL DEFAULT '',
  body_fr     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS changelog_version_idx ON changelog (created_at DESC);

-- Seed with recent versions
INSERT INTO changelog (version, title_en, title_fr, body_en, body_fr, created_at) VALUES
  ('1.73', 'Feed management, changelog UI, UX polish',
   'Gestion des flux, journal des mises à jour, polish UX',
   'Feed management page: stats per feed, sortable columns, created_at; score up to 10 articles (30-day window), delete articles, delete feed; bottom toasts. Changelog page + GET /api/changelog + changelog table. Layout 872px; EN/FR toggle below nav icons (~20% smaller). Stats feed ranking: full source on hover. GET /api/fetch-feeds sets fetched_at.',
   'Page gestion des flux : stats par flux, colonnes triables, date de création ; scorer jusqu’à 10 articles (30 jours), supprimer articles ou flux ; toasts. Page changelog + API + table. Largeur 872px ; EN/FR sous les icônes. Classement des flux : nom complet au survol. fetch-feeds renseigne fetched_at.',
   '2026-04-07T12:00:00Z'),
  ('1.72', 'Stats redesign & fetch delay fix',
   'Refonte stats & correction délai fetch',
   'Stats page: 3-state flow (home KPIs → select topic → select period), lightweight kpi_only endpoint. Article ranking with lazy load (50 at a time). Cron Monitor avg delay now uses fetched_at instead of pub_date, displayed as Xm XXs.',
   'Page stats : flux en 3 états (KPIs accueil → choix topic → choix période), endpoint kpi_only léger. Classement des articles avec chargement progressif (50 à la fois). Délai moyen du Cron Monitor utilise maintenant fetched_at au lieu de pub_date, affiché en Xm XXs.',
   '2026-04-06T12:00:00Z'),
  ('1.71', 'Cron optimization phase 2',
   'Optimisation cron phase 2',
   'cron-fetch: cycle ~10 min (ceil(N/10), cap 4), adaptive mini-score min(50, max(15, inserted)), 6s reserve. cron-score: multi-topic scoring (12s deadline, threshold 20). fetchAndStoreTopicDynamic returns {summary, inserted}.',
   'cron-fetch : cycle ~10 min (ceil(N/10), cap 4), mini-score adaptatif min(50, max(15, inserted)), réserve 6s. cron-score : scoring multi-topic (deadline 12s, seuil 20). fetchAndStoreTopicDynamic retourne {summary, inserted}.',
   '2026-04-06T10:00:00Z'),
  ('1.70', 'Avg delay fix & doc sync',
   'Correction délai moyen & sync doc',
   'Cron Monitor avg delay: cohort = pub_date in 24h + scored articles only (aligned with Fetched 24h). Full SPEC.md sync.',
   'Délai moyen Cron Monitor : cohorte = pub_date 24h + articles scorés uniquement (aligné avec Fetched 24h). Sync complète de SPEC.md.',
   '2026-04-06T08:00:00Z'),
  ('1.69', 'Cron optimization phase 1',
   'Optimisation cron phase 1',
   'Netlify crons: minute batched fetch k=min(ceil(N/15),3), ~12s run deadline. cron-score prioritizes backlog then newest last_fetched_at. Post-fetch mini-score ≤15 articles.',
   'Crons Netlify : fetch par minute k=min(ceil(N/15),3), deadline ~12s. cron-score priorise le backlog puis le dernier last_fetched_at. Mini-score post-fetch ≤15 articles.',
   '2026-04-05T18:00:00Z'),
  ('1.68', 'Supabase pagination fix & Top 20 refresh',
   'Correction pagination Supabase & refresh Top 20',
   '/api/cron-stats: paginate article queries in 1000-row batches (fixes Supabase 1k row cap). Top 20 auto-refresh every 5 min. Topic badge on Top 20 cards.',
   '/api/cron-stats : pagination des requêtes articles par lots de 1000 (corrige le cap Supabase à 1k). Refresh auto Top 20 toutes les 5 min. Badge topic sur les cartes Top 20.',
   '2026-04-05T16:00:00Z')
ON CONFLICT DO NOTHING;
