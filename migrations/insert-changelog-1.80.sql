-- Run once in Supabase SQL Editor if `changelog` has no row for 1.80.
-- If you already inserted 1.80 with older "Plan B" text, run instead:
--   DELETE FROM changelog WHERE version = '1.80';
-- then re-run this file, or UPDATE title_en/title_fr/body_en/body_fr/created_at manually.

INSERT INTO changelog (version, title_en, title_fr, body_en, body_fr, created_at) VALUES
  (
    '1.80',
    'v1.80: Supabase sign-in for Topics & Feed management',
    'v1.80 : connexion Supabase pour Topics et gestion des flux',
    'Optional Supabase Auth (email + password). Guests keep full access to home, stats, crons, changelog, and settings. Topics and Feed management (nav icons + APIs) require a session; APIs return 401 without valid cookies. @supabase/ssr, middleware.ts session refresh, AuthProvider + AuthModal; registration stores first/last name in user_metadata. GET /api/topics without ?all=1 stays public for the homepage topic grid.',
    'Authentification Supabase optionnelle (e-mail + mot de passe). Les invités gardent l''accès complet à l''accueil, stats, crons, changelog et paramètres. Les pages Topics et gestion des flux (icônes + API) exigent une session ; les API répondent 401 sans cookies valides. @supabase/ssr, middleware pour les cookies, AuthProvider + AuthModal ; inscription avec prénom/nom en user_metadata. GET /api/topics sans ?all=1 reste public pour la grille des sujets.',
    '2026-04-08T12:00:00Z'
  );
