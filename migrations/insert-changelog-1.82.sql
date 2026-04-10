-- Run once in Supabase SQL Editor if `changelog` has no row for 1.82.
-- If you already inserted 1.82, skip or run: DELETE FROM changelog WHERE version = '1.82';

INSERT INTO changelog (version, title_en, title_fr, body_en, body_fr, created_at) VALUES
  (
    '1.82',
    'v1.82: My Account, Users management, Top 20 timestamp, GA & AI labels',
    'v1.82 : Mon compte, gestion utilisateurs, timestamp Top 20, GA & labels IA',
    'Settings: My Account section for authenticated users (editable first/last name, read-only email and user type badge). Users management for owner users (inline edit name and type via service-role API). Homepage: removed manual refresh button; added last-updated timestamp on Top 20 subtitle (HH:MM). Baselines updated: EN "Tech intelligence, powered by AI." / FR "La tech décodée par l''IA". Topic creation reorganized: Label EN, Label FR, Slug on one row; Domain moved up; new "Generate with AI" button fills slug, label FR and domain from label EN via /api/topics/generate-labels. Cron status: score age only flags slow/high when backlog > 0. Google Analytics (G-X8RR3FMCR0) integrated in layout.tsx.',
    'Paramètres : section Mon compte pour les utilisateurs connectés (prénom/nom modifiables, e-mail et type en lecture seule). Gestion des utilisateurs pour les owners (modification inline nom et type via API service-role). Accueil : bouton refresh supprimé ; horodatage de mise à jour sur le sous-titre Top 20 (HH:MM). Baselines mises à jour : EN « Tech intelligence, powered by AI. » / FR « La tech décodée par l''IA ». Création de topic réorganisée : Label EN, Label FR, Slug sur une ligne ; Domain remonté ; bouton « Generate with AI » remplit slug, label FR et domain depuis le label EN via /api/topics/generate-labels. Statut cron : l''âge du scoring ne déclenche slow/high que si le backlog > 0. Google Analytics (G-X8RR3FMCR0) intégré dans layout.tsx.',
    '2026-04-10T12:00:00Z'
  );
