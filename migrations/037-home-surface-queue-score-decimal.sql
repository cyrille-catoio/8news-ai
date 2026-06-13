-- 037: keep one-decimal precision in home_surface_queue.score.
-- Run in Supabase SQL Editor.
--
-- Why
-- ---
-- `home_surface_queue.score` was introduced as SMALLINT in migration 022,
-- when both article relevance scores and video recap scores were integers.
-- Since migration 034, `video_transcriptions.summary_score` is NUMERIC(3,1)
-- so high-quality video recaps can score 9.1, 9.4, 9.8, etc.
--
-- The queue is a denormalized copy of the source score used by the home
-- TOP STORY / TOP VIDEO threshold filters. It should preserve the source
-- precision: article rows remain integer-like (e.g. 9.0), video rows keep
-- their decimal (e.g. 9.4). User thresholds stay integer cookies/settings
-- (8 means score >= 8.0, 9 means score >= 9.0).
--
-- This migration also updates the legacy `pick_home_surface` RPC signature
-- and backfills existing video queue rows from `video_transcriptions`, so
-- already-scored 9.x recaps become eligible without waiting for a re-score.

ALTER TABLE public.home_surface_queue
  ALTER COLUMN score TYPE NUMERIC(3,1)
  USING score::numeric(3,1);

ALTER TABLE public.home_surface_queue
  DROP CONSTRAINT IF EXISTS home_surface_queue_score_range;

ALTER TABLE public.home_surface_queue
  ADD CONSTRAINT home_surface_queue_score_range
  CHECK (score >= 1 AND score <= 10);

-- Refresh existing video queue rows from the canonical decimal score.
UPDATE public.home_surface_queue q
SET score = vt.summary_score::numeric(3,1)
FROM public.video_transcriptions vt
WHERE q.kind = 'video'
  AND q.ref_id = vt.id
  AND vt.summary_score IS NOT NULL;

-- Recreate the RPC with a NUMERIC threshold. The current API routes now
-- perform their own SELECTs, but keeping the function aligned avoids a
-- future caller reintroducing integer-only filtering.
DROP FUNCTION IF EXISTS public.pick_home_surface(TEXT, TEXT, SMALLINT, TEXT[]);
DROP FUNCTION IF EXISTS public.pick_home_surface(TEXT, TEXT, NUMERIC, TEXT[]);

CREATE OR REPLACE FUNCTION public.pick_home_surface(
  p_kind TEXT,
  p_lang TEXT,
  p_min_score NUMERIC,
  p_excluded_topics TEXT[] DEFAULT '{}'::TEXT[]
)
RETURNS TABLE (
  id BIGINT,
  ref_id BIGINT,
  score NUMERIC,
  topic_id TEXT,
  display_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.home_surface_queue q
  SET
    display_count = q.display_count + 1,
    last_displayed_at = now()
  WHERE q.id = (
    SELECT inner_q.id
    FROM public.home_surface_queue inner_q
    WHERE inner_q.kind = p_kind
      AND inner_q.lang = p_lang
      AND inner_q.score >= p_min_score
      AND (
        coalesce(array_length(p_excluded_topics, 1), 0) = 0
        OR inner_q.topic_id IS NULL
        OR NOT (inner_q.topic_id = ANY(p_excluded_topics))
      )
    ORDER BY
      inner_q.display_count ASC,
      inner_q.last_displayed_at ASC NULLS FIRST,
      inner_q.inserted_at DESC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING q.id, q.ref_id, q.score, q.topic_id, q.display_count;
END;
$$;

REVOKE ALL ON FUNCTION public.pick_home_surface(TEXT, TEXT, NUMERIC, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pick_home_surface(TEXT, TEXT, NUMERIC, TEXT[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pick_home_surface(TEXT, TEXT, NUMERIC, TEXT[]) TO service_role;

COMMENT ON COLUMN public.home_surface_queue.score IS
  'Denormalized home-threshold score. NUMERIC(3,1) since mig 037: article rows keep integer-like scores (e.g. 9.0), video rows preserve decimal recap scores (e.g. 9.4).';
