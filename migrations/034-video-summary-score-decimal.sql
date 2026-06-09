-- 034: allow one-decimal precision for the AI video recap quality score.
-- Run in Supabase SQL Editor.
--
-- Why: scores cluster at the top, and 9 vs 10 is too coarse to rank the
-- very best recaps. We now let the scorer emit one decimal in the 9-10
-- band (e.g. 9.1, 9.7) while 1-8 stay integers. Column goes from
-- SMALLINT to NUMERIC(3,1); existing integer rows become e.g. 8.0 (still
-- rendered as « 8 » by the UI's integer-aware formatter).

ALTER TABLE public.video_transcriptions
  DROP CONSTRAINT IF EXISTS video_transcriptions_summary_score_range;

ALTER TABLE public.video_transcriptions
  ALTER COLUMN summary_score TYPE NUMERIC(3,1)
  USING summary_score::numeric(3,1);

ALTER TABLE public.video_transcriptions
  ADD CONSTRAINT video_transcriptions_summary_score_range
  CHECK (summary_score IS NULL OR (summary_score >= 1 AND summary_score <= 10));
