-- Run once in Supabase SQL Editor if `changelog` has no row for 1.84.
-- If you already inserted 1.84, skip or run: DELETE FROM changelog WHERE version = '1.84';

INSERT INTO changelog (version, title_en, title_fr, body_en, body_fr, created_at) VALUES
  (
    '1.84',
    'v1.84: Personalization UX + cron 30s budget + summary/count polish',
    'v1.84 : Personnalisation topics + budget cron 30s + polish résumé',
    'Added signed-in user topic personalization (selection, onboarding modal, per-user persistence, and homepage top-feed filtering by selected topics). Upgraded Netlify cron runtime budgeting to align with 30s server window (fetch + score budgets and production env defaults). Refined summary metadata wording for selected-topic mode (shows analyzed count) and polished the “Customize my topics” controls.',
    'Ajout de la personnalisation des topics pour les utilisateurs connectés (sélection, onboarding, persistance par utilisateur et filtrage du flux top de l''accueil selon les topics choisis). Passage des budgets de runtime cron Netlify au nouveau plafond serveur 30s (fetch + score + variables de prod). Ajustement du libellé méta du résumé en mode topic sélectionné (affichage du nombre analysé) et amélioration UI des contrôles « Personnaliser mes topics ».',
    '2026-04-12T12:00:00Z'
  );
