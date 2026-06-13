-- 036: allow one-decimal precision for the Daily Podcast importance score.
-- Run in Supabase SQL Editor.
--
-- Why: the « top videos of yesterday » bullets pinned at the head of the
-- Daily Podcast carry the video recap quality score, which became
-- NUMERIC(3,1) in migration 034 (one decimal in the 9-10 band, e.g.
-- 9.3). `generate-top-summary.ts` was rounding that score to an integer
-- before mirroring it into `summary_bullets.importance_score` because
-- the column was SMALLINT (mig 026). Widening the column to NUMERIC(3,1)
-- lets the decimal survive end-to-end so the home accordion, the audio
-- player and the newsletter all show « 9.3/10 » for video bullets.
-- Article bullets keep their integer LLM score (stored as e.g. 9.0,
-- still rendered « 9 » by the integer-aware `formatScore`).

ALTER TABLE public.summary_bullets
  DROP CONSTRAINT IF EXISTS summary_bullets_importance_score_range;

ALTER TABLE public.summary_bullets
  ALTER COLUMN importance_score TYPE NUMERIC(3,1)
  USING importance_score::numeric(3,1);

ALTER TABLE public.summary_bullets
  ADD CONSTRAINT summary_bullets_importance_score_range
  CHECK (importance_score IS NULL OR (importance_score BETWEEN 1 AND 10));

COMMENT ON COLUMN public.summary_bullets.importance_score IS
  'Editorial importance 1-10 for the bullet''s group. NUMERIC(3,1) since mig 036: article bullets keep an integer LLM score (e.g. 9.0), video bullets carry the recap quality score with one decimal (e.g. 9.3). NULL on rows predating mig 026 or when the LLM omitted the score.';
