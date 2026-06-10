-- 035: Single-pass KPI aggregates for the Stats home screen.
-- Run once in Supabase SQL Editor.
--
-- Why
-- ---
-- `/api/stats?kpi_only=1` used to fan out 11 parallel PostgREST
-- `count: "exact"` queries (1 total + 10 per-score buckets). On a
-- production `articles` table with hundreds of thousands of rows, each
-- COUNT(*) can hit the statement timeout (~8s), so every query returned
-- `count = null` and the UI showed 0 total articles.
--
-- This RPC scans the table once and returns all KPI fields the Stats
-- home state needs.

CREATE OR REPLACE FUNCTION public.get_global_article_kpis()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total_articles', COUNT(*)::bigint,
    'scored_articles', COUNT(*) FILTER (WHERE relevance_score IS NOT NULL)::bigint,
    'avg_score', COALESCE(
      ROUND(AVG(relevance_score) FILTER (WHERE relevance_score IS NOT NULL), 1),
      0
    ),
    'hit_rate', COALESCE(
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE relevance_score >= 7)
        / NULLIF(COUNT(*) FILTER (WHERE relevance_score IS NOT NULL), 0),
        1
      ),
      0
    )
  )
  FROM public.articles;
$$;

REVOKE ALL ON FUNCTION public.get_global_article_kpis() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_global_article_kpis() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_article_kpis() TO service_role;

COMMENT ON FUNCTION public.get_global_article_kpis() IS
  'All-time article KPIs for /api/stats?kpi_only=1 — one table scan instead of 11 COUNT queries.';
