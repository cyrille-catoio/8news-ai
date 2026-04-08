-- Run once in Supabase SQL Editor if `changelog` has no row for 1.80.
-- Plan B: optional during local dev; run before/after deploy of 1.80, or UPDATE this row when features ship.
-- If you already inserted 1.80, skip or run: DELETE FROM changelog WHERE version = '1.80';

INSERT INTO changelog (version, title_en, title_fr, body_en, body_fr, created_at) VALUES
  (
    '1.80',
    'v1.80 dev cycle (plan B bump)',
    'Cycle dev 1.80 (bump amont)',
    'Plan B: version.json and APP_VERSION set to 1.80 at start of development; SPEC §17 through 1.80; insert-changelog-1.80.sql for Supabase. Update this row and §17 when 1.80 ships. No additional product changes vs 1.79 until features land.',
    'Plan B : version.json et APP_VERSION à 1.80 en début de cycle ; SPEC §17 jusqu''à 1.80 ; insert-changelog-1.80.sql pour Supabase. Mettre à jour cette ligne et §17 au déploiement de 1.80. Pas d''autre changement produit vs 1.79 tant que les features ne sont pas livrées.',
    '2026-04-14T12:00:00Z'
  );
