-- Run once in Supabase SQL Editor if `changelog` has no row for 1.79.
-- If you already inserted 1.79, skip or run: DELETE FROM changelog WHERE version = '1.79';

INSERT INTO changelog (version, title_en, title_fr, body_en, body_fr, created_at) VALUES
  (
    '1.79',
    'Netlify 13s cron optimization & freshness SLA',
    'Optimisation cron Netlify 13s & SLA fraîcheur',
    'Cron-fetch and cron-score now enforce a strict Netlify-safe runtime budget (13s wall cap, internal budget plus safety reserve), with fresh-first scoring priority, adaptive per-run quotas, and anti-starvation fairness. Manual feed scoring route is now maxDuration 13 with elapsed-budget partial responses. Cron Monitor adds delay p95, SLA under 5m, fresh backlog 5m, and alerts.',
    'cron-fetch et cron-score appliquent désormais un budget d''exécution strict compatible Netlify (cap 13s, budget interne + réserve), avec priorité de scoring fresh-first, quotas adaptatifs, et garde-fou anti-famine. La route de scoring manuel des flux passe en maxDuration 13 avec réponses partielles quand le budget est atteint. Cron Monitor ajoute délai p95, SLA < 5 min, backlog frais 5 min et alertes.',
    '2026-04-13T12:00:00Z'
  );
