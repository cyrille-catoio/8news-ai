-- Run once in Supabase SQL Editor if `changelog` has no row for 1.77.
-- If you already inserted 1.77, skip or run: DELETE FROM changelog WHERE version = '1.77';

INSERT INTO changelog (version, title_en, title_fr, body_en, body_fr, created_at) VALUES
  (
    '1.77',
    'Release 1.77: version bump & .gitignore .claude',
    'Version 1.77 : bump et gitignore .claude',
    'public/version.json and APP_VERSION 1.77. .gitignore ignores .claude/ (local agent worktrees). SPEC §17 through 1.77; add this row to changelog table for in-app Changelog. No product change vs 1.76.',
    'version.json et APP_VERSION 1.77. .gitignore exclut .claude/ (worktrees agents locaux). SPEC §17 jusqu''à 1.77 ; ajouter cette ligne dans changelog pour le journal in-app. Pas de changement produit par rapport à 1.76.',
    '2026-04-11T12:00:00Z'
  );
