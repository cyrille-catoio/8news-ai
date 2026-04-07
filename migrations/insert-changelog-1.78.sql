-- Run once in Supabase SQL Editor if `changelog` has no row for 1.78.
-- If you already inserted 1.78, skip or run: DELETE FROM changelog WHERE version = '1.78';

INSERT INTO changelog (version, title_en, title_fr, body_en, body_fr, created_at) VALUES
  (
    '1.78',
    'Scoring backlog fix & Netlify-safe manual feed score',
    'Scoring : backlog sans fenêtre 7j & flux admin Netlify',
    'cron-score and post-fetch mini-score pass windowHours null: all unscored articles eligible (not only pub_date in last 168h). Backlog counts all unscored per topic. POST feeds/[feedId]/score: OpenAI batches of 15, 6s timeout per call, maxDuration 26 for Netlify. test-score still defaults to 168h. version.json and APP_VERSION 1.78.',
    'cron-score et mini-score post-fetch : windowHours null, tous les non scorés éligibles (plus seulement 168h de pub_date). Backlog = tous les non scorés par topic. Score manuel par flux : lots 15, timeout OpenAI 6s, maxDuration 26 (Netlify). test-score garde 168h par défaut. version 1.78.',
    '2026-04-12T12:00:00Z'
  );
