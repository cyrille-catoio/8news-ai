-- Run once in Supabase SQL Editor if `changelog` has no row for 1.85.
-- If you already inserted 1.85, skip or run: DELETE FROM changelog WHERE version = '1.85';

INSERT INTO changelog (version, title_en, title_fr, body_en, body_fr, created_at) VALUES
  (
    '1.85',
    'v1.85: On-demand top analysis, member topic submission and cache stability',
    'v1.85 : Analyse top à la demande, soumission de topic membre et stabilité cache',
    'Homepage top articles analysis is now user-triggered via a dedicated button ("Analyze top articles"), with contextual toasts for topic/period guidance and updated wording ("selected and analyzed by AI"). Signed-in members can propose new topics from home personalization; created topics are stored inactive/hidden pending owner validation, with a 24h max validation notice. Improved action-button visual consistency and hardened top-summary cache hit stability (deterministic ordering + normalized cache key).',
    'L''analyse des top articles sur l''accueil devient déclenchée à la demande via un bouton dédié (« Analyse des top articles »), avec toasts de guidance topic/période et wording mis à jour (« sélectionnés et analysés par IA »). Les membres connectés peuvent proposer un nouveau topic depuis la personnalisation home ; les topics créés sont enregistrés inactifs/masqués en attente de validation owner, avec message de validation sous 24h max. Amélioration de la cohérence visuelle des boutons d''action et fiabilisation du cache de résumé top (ordre déterministe + clé normalisée).',
    '2026-04-12T20:00:00Z'
  );
