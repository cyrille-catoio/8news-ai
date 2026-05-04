-- 021: Editorial quality score (1-10) for AI video recap Markdown in video_transcriptions
-- Run in Supabase SQL Editor.
--
-- Scored by netlify/functions/cron-video-summary-score-background.ts (15 min budget).
-- One row per (video_id, lang); summaries live here, not on youtube_videos.

ALTER TABLE public.video_transcriptions
  ADD COLUMN IF NOT EXISTS summary_score SMALLINT,
  ADD COLUMN IF NOT EXISTS summary_scored_at TIMESTAMPTZ;

ALTER TABLE public.video_transcriptions
  DROP CONSTRAINT IF EXISTS video_transcriptions_summary_score_range;

ALTER TABLE public.video_transcriptions
  ADD CONSTRAINT video_transcriptions_summary_score_range
  CHECK (summary_score IS NULL OR (summary_score >= 1 AND summary_score <= 10));

-- Backlog: rows that need scoring (planner can use this for large tables)
CREATE INDEX IF NOT EXISTS idx_vt_summary_score_backlog
  ON public.video_transcriptions (id ASC)
  WHERE summary_score IS NULL
    AND summary_md IS NOT NULL
    AND length(trim(summary_md)) > 0;
