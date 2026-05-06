-- 022: home_surface_queue — round-robin pick of articles + videos for the
-- "TOP STORY" and "TOP VIDEO · MAINTENANT" slots on the SPA Briefing home.
--
-- Replaces the in-memory pool+rotation logic that lived inside
-- /api/news/top-story and /api/videos/top with a persistent queue:
-- every scored article (>= 7) and scored video (>= 7) is inserted as a
-- candidate; the home endpoints pick the row with the lowest
-- `display_count` (ties broken by least-recently-shown then freshest)
-- matching the visitor's per-user threshold, then atomically bump the
-- counter via the `pick_home_surface()` function below. When all
-- eligible rows have been shown once, the next pick advances them to
-- `display_count = 2`, etc., so the home keeps cycling indefinitely.
--
-- Per-user thresholds (default 9 for articles, 8 for videos) live in
-- the visitor's cookie + auth.users.user_metadata; the endpoints only
-- pass the integer to this function.
--
-- Run in Supabase SQL Editor (idempotent — safe to re-run).

CREATE TABLE IF NOT EXISTS public.home_surface_queue (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('article', 'video')),
  -- Foreign key intentionally not enforced: `articles.id` is BIGINT and
  -- `video_transcriptions.id` is SERIAL/INT; we keep this loose so a
  -- single column can polymorphically reference either via `kind`.
  ref_id BIGINT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('en', 'fr')),
  -- Denormalized score at insert time so the SELECT filter `score >= ?`
  -- never has to join back to the source table just to threshold.
  score SMALLINT NOT NULL,
  topic_id TEXT NULL,
  display_count INT NOT NULL DEFAULT 0,
  last_displayed_at TIMESTAMPTZ NULL,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One queue row per (kind, ref, lang). Articles get one row per lang
-- (the same article serves both EN/FR via title_ai_*/snippet_ai_*).
-- Videos get one row total since `video_transcriptions` is already
-- per-(video_id, lang).
CREATE UNIQUE INDEX IF NOT EXISTS idx_home_queue_uniq
  ON public.home_surface_queue (kind, ref_id, lang);

-- Pick query covering index. Order matches the pick semantics:
--   1) lowest display_count first (un-shown items win)
--   2) least-recently-shown next (round-robin within a count)
--   3) freshest insertion as last tie-breaker (new content rises)
CREATE INDEX IF NOT EXISTS idx_home_queue_pick
  ON public.home_surface_queue (
    kind, lang, score,
    display_count ASC,
    last_displayed_at ASC NULLS FIRST,
    inserted_at DESC
  );

-- Atomic SELECT + UPDATE in one round trip. Returns the row that was
-- just bumped, or zero rows when the queue is empty for this filter.
-- Calling code is the home endpoint, with `p_min_score` driven by the
-- visitor's per-user cookie (default 9 for articles, 8 for videos)
-- and `p_excluded_topics` mirroring the hidden-topics list so the
-- home never surfaces a row whose topic was hidden by the operator.
CREATE OR REPLACE FUNCTION public.pick_home_surface(
  p_kind TEXT,
  p_lang TEXT,
  p_min_score SMALLINT,
  p_excluded_topics TEXT[] DEFAULT '{}'::TEXT[]
)
RETURNS TABLE (
  id BIGINT,
  ref_id BIGINT,
  score SMALLINT,
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

-- Lock down direct table + function access. The home endpoints use
-- the service-role server client; the browser never touches this
-- table directly. Public roles get nothing.
ALTER TABLE public.home_surface_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role only" ON public.home_surface_queue;
CREATE POLICY "service role only"
  ON public.home_surface_queue
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON FUNCTION public.pick_home_surface(TEXT, TEXT, SMALLINT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pick_home_surface(TEXT, TEXT, SMALLINT, TEXT[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pick_home_surface(TEXT, TEXT, SMALLINT, TEXT[]) TO service_role;

-- ─── Backfill ────────────────────────────────────────────────────────
-- Seed the queue with whatever already qualifies, so the first deploy
-- doesn't render an empty home until new scoring events trickle in.
-- Conservative time windows (7 days / 14 days) keep the seed bounded.

INSERT INTO public.home_surface_queue (kind, ref_id, lang, score, topic_id, inserted_at)
SELECT 'article', a.id, 'en', a.relevance_score, a.topic, COALESCE(a.scored_at, now())
FROM public.articles a
WHERE a.relevance_score IS NOT NULL
  AND a.relevance_score >= 7
  AND COALESCE(a.scored_at, a.fetched_at, a.pub_date) >= now() - interval '7 days'
ON CONFLICT (kind, ref_id, lang) DO NOTHING;

INSERT INTO public.home_surface_queue (kind, ref_id, lang, score, topic_id, inserted_at)
SELECT 'article', a.id, 'fr', a.relevance_score, a.topic, COALESCE(a.scored_at, now())
FROM public.articles a
WHERE a.relevance_score IS NOT NULL
  AND a.relevance_score >= 7
  AND COALESCE(a.scored_at, a.fetched_at, a.pub_date) >= now() - interval '7 days'
ON CONFLICT (kind, ref_id, lang) DO NOTHING;

INSERT INTO public.home_surface_queue (kind, ref_id, lang, score, topic_id, inserted_at)
SELECT 'video', vt.id, vt.lang, vt.summary_score, vt.topic_id, COALESCE(vt.summary_scored_at, now())
FROM public.video_transcriptions vt
WHERE vt.summary_score IS NOT NULL
  AND vt.summary_score >= 7
  AND vt.topic_id IS NOT NULL
  AND vt.slug_keywords IS NOT NULL
  AND vt.published_date IS NOT NULL
  AND vt.summary_md IS NOT NULL
  AND length(trim(vt.summary_md)) > 0
  AND COALESCE(vt.summary_scored_at, vt.created_at) >= now() - interval '14 days'
ON CONFLICT (kind, ref_id, lang) DO NOTHING;

-- Future housekeeping (optional, not wired up): a periodic
--   DELETE FROM public.home_surface_queue WHERE inserted_at < now() - interval '60 days';
-- keeps the queue bounded if ingestion outpaces display rotation.
