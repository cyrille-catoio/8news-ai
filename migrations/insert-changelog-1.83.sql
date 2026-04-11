-- Run once in Supabase SQL Editor if `changelog` has no row for 1.83.
-- If you already inserted 1.83, skip or run: DELETE FROM changelog WHERE version = '1.83';

INSERT INTO changelog (version, title_en, title_fr, body_en, body_fr, created_at) VALUES
  (
    '1.83',
    'v1.83: Top 50 homepage + AI grouped summary + display filtering',
    'v1.83 : Top 50 accueil + résumé IA groupé + filtre affichage',
    'Homepage Top feed now uses 50 articles over 24h. Topics include a new is_displayed toggle; hidden topics stay active for ingestion/scoring but are excluded from homepage display and Top feed selection. Added POST /api/news/top-summary for homepage AI summary with grouped bullet points and source references, plus audio playback in the same SummaryBox experience. UI updates include AI Summary label, Top 50 subtitle styling, progressive reveal animation for homepage summary, and loading indicator text.',
    'Le flux Top de l''accueil passe à 50 articles sur 24h. Les topics ont un nouveau toggle is_displayed ; les topics masqués restent actifs pour l''ingestion/scoring mais sont exclus de l''affichage accueil et de la sélection Top. Ajout de POST /api/news/top-summary pour un résumé IA de la home avec bullet points groupés et références sources, avec lecture audio dans la même expérience SummaryBox. Mises à jour UI : libellé Résumé IA, style du sous-titre Top 50, animation d''affichage progressive du résumé sur la home et texte de chargement.',
    '2026-04-11T12:00:00Z'
  );
