-- Run once in Supabase SQL Editor if `changelog` has no row for 1.88.
-- If you already inserted 1.88, skip or run: DELETE FROM changelog WHERE version = '1.88';

INSERT INTO changelog (version, title_en, title_fr, body_en, body_fr, created_at) VALUES
  (
    '1.88',
    'v1.88: Specialized background functions and external scheduling',
    'v1.88 : Fonctions background spécialisées et scheduling externe',
    'Specialized background functions: fetch-background is now fetch-only (no mini-scoring), score-background is score-only with raised caps (150 articles/run, 300 hard cap, aggressive adaptive scaling). Scoring stamps last_scored_at before processing to prevent double-scoring from concurrent runs. Removed scheduled trigger functions (cron-fetching, cron-scoring) and their netlify.toml schedule declarations — scheduling is now handled externally via cron-job.org calling the background function endpoints directly.',
    'Spécialisation des fonctions background : fetch-background est désormais fetch-only (sans mini-scoring), score-background est score-only avec des caps relevés (150 articles/run, 300 hard cap, scaling adaptatif agressif). Le scoring pose last_scored_at avant le traitement pour empêcher le double-scoring en cas d''exécutions concurrentes. Suppression des scheduled triggers (cron-fetching, cron-scoring) et de leurs déclarations de schedule dans netlify.toml — le scheduling est désormais externalisé via cron-job.org appelant directement les endpoints des background functions.',
    '2026-04-13T06:00:00Z'
  );
