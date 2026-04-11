-- Run once in Supabase SQL Editor if `changelog` has no row for 1.84.
-- If you already inserted 1.84, skip or run: DELETE FROM changelog WHERE version = '1.84';

INSERT INTO changelog (version, title_en, title_fr, body_en, body_fr, created_at) VALUES
  (
    '1.84',
    'v1.84: Homepage summary polish, cache and responsive topic buttons',
    'v1.84 : Ajustements résumé home, cache et boutons topics responsive',
    'Homepage AI summary refinements: title/metadata line merged into a single row, label changed to TOP ARTICLES, and phrasing simplified to “N articles, scored and analyzed by AI” (FR equivalent). Added 30-minute database cache for POST /api/news/top-summary keyed by homepage article set to reduce OpenAI token usage and speed up reloads. Improved homepage topic pill responsiveness so labels stay on one line at intermediate widths by reducing columns.',
    'Ajustements du résumé IA de la page d''accueil : fusion du titre et de la méta sur une seule ligne, libellé TOP ARTICLES, et formulation simplifiée en “N articles, scorés et analysés par IA” (équivalent EN). Ajout d''un cache base de données de 30 minutes pour POST /api/news/top-summary, indexé sur l''ensemble d''articles home, afin de réduire la consommation de tokens OpenAI et accélérer les rechargements. Amélioration du responsive des boutons topics pour garder les libellés sur une seule ligne aux largeurs intermédiaires (moins de colonnes par ligne).',
    '2026-04-11T23:59:00Z'
  );
