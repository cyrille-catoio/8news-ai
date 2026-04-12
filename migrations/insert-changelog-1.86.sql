-- Run once in Supabase SQL Editor if `changelog` has no row for 1.86.
-- If you already inserted 1.86, skip or run: DELETE FROM changelog WHERE version = '1.86';

INSERT INTO changelog (version, title_en, title_fr, body_en, body_fr, created_at) VALUES
  (
    '1.86',
    'v1.86: Cron rollback + member submission UX hardening',
    'v1.86 : Retour réglage cron + solidification UX soumission membre',
    'Restored previous cron runtime tuning (13s baseline) in fetch/score functions and removed 30s production overrides from netlify.toml for stability. Improved member topic-submission UX: after non-owner creation, show a message-only pending-validation view with a dedicated back-to-home action (no form shown). Refined home personalization controls so the top-analysis button stays globally available but is hidden during authenticated topic-edit mode.',
    'Rétablissement du paramétrage cron précédent (baseline 13s) dans les fonctions fetch/score et suppression des overrides production 30s dans netlify.toml pour plus de stabilité. Amélioration UX de soumission de topic côté membre : après création non-owner, affichage d''un écran message-only de validation en attente avec action dédiée de retour à l''accueil (sans formulaire). Ajustement des contrôles de personnalisation home : le bouton d''analyse top reste globalement disponible mais est masqué pendant le mode édition des topics pour un utilisateur connecté.',
    '2026-04-12T22:00:00Z'
  );
