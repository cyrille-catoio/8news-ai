-- Run once in Supabase SQL Editor if `changelog` has no row for 1.87.
-- If you already inserted 1.87, skip or run: DELETE FROM changelog WHERE version = '1.87';

INSERT INTO changelog (version, title_en, title_fr, body_en, body_fr, created_at) VALUES
  (
    '1.87',
    'v1.87: Background functions architecture and multi-pass cron optimization',
    'v1.87 : Architecture background functions et optimisation cron multi-pass',
    'Migrated cron jobs from scheduled functions (30s limit) to a scheduled-trigger + background-function architecture with 15-minute runtime. Scheduled functions (cron-fetching, cron-scoring) now act as lightweight triggers that POST to background functions carrying the full logic. Fetch background processes all active topics in a multi-pass loop, re-checking staleness each pass and running extended mini-scoring (up to 80 articles) after each topic. Score background runs a multi-pass loop that re-queries backlogs and keeps scoring until all are drained or budget is exhausted, with fair per-topic budget distribution. Cron schedule changed from every minute to every 10 minutes. Fixed Cron Monitor timeline to use fetched_at instead of pub_date for activity buckets.',
    'Migration des crons depuis les scheduled functions (limite 30s) vers une architecture trigger schedulé + background function avec 15 minutes de runtime. Les scheduled functions (cron-fetching, cron-scoring) deviennent des déclencheurs légers qui POST vers des background functions contenant toute la logique. Le fetch background traite tous les topics actifs en boucle multi-pass, re-vérifiant la fraîcheur à chaque passe et exécutant un mini-scoring étendu (jusqu''à 80 articles) après chaque topic. Le score background tourne en boucle multi-pass qui re-query les backlogs et continue le scoring jusqu''à vidange complète ou épuisement du budget, avec répartition équitable du budget par topic. Cadence cron changée de chaque minute à toutes les 10 minutes. Correction du tableau d''activité Cron Monitor pour utiliser fetched_at au lieu de pub_date.',
    '2026-04-13T02:00:00Z'
  );
