-- Run once in Supabase SQL Editor if `changelog` has no row for 1.89.
-- If you already inserted 1.89, skip or run: DELETE FROM changelog WHERE version = '1.89';

INSERT INTO changelog (version, title_en, title_fr, body_en, body_fr, created_at) VALUES
  (
    '1.89',
    'v1.89: Topic categories, admin menu, user menu, prompt and UI polish',
    'v1.89 : Catégories de topics, menu admin, menu utilisateur, prompt et polish UI',
    'Added topic categories system (Technology, Health, Sport) with a dedicated categories table, API endpoint, and selectors in topic creation and editing. Replaced separate Topics and Feeds nav icons with a single admin star-icon dropdown (owner-only). Added a user icon dropdown for sign-in/sign-out, removing the sign-out button from the header bar. Enriched the top-summary AI prompt with anecdotes and concrete data requirements. Summary metadata line changed to full grey. Onboarding modal filtered to Technology category. Various subtitle alignment and topic display fixes.',
    'Ajout du système de catégories de topics (Technologie, Santé, Sport) avec table dédiée, endpoint API et sélecteurs dans la création et l''édition des topics. Remplacement des icônes séparées Topics et Flux par un menu déroulant unique étoile admin (owner uniquement). Ajout d''une icône utilisateur avec menu déroulant connexion/déconnexion, suppression du bouton déconnexion de la barre header. Enrichissement du prompt résumé top avec exigences d''anecdotes et données concrètes. Ligne méta du résumé passée en gris. Modal d''onboarding filtrée sur la catégorie Technologie. Corrections d''alignement sous-titre et d''affichage des topics.',
    '2026-04-13T10:00:00Z'
  );
