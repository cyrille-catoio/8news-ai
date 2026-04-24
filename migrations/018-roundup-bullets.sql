-- 018: summary_bullets gains video_roundup_id for the structured
-- briefing bullets produced by generate-video-roundup.ts. Mirror of
-- the existing video_transcription_id pattern (added in migration 014).
-- Run in Supabase SQL Editor.

ALTER TABLE summary_bullets
  ADD COLUMN IF NOT EXISTS video_roundup_id INT REFERENCES video_roundups(id) ON DELETE CASCADE;

-- Speeds up the per-roundup re-fetch + the "delete then insert" cycle
-- in `insertVideoRoundupBullets` (re-running a roundup wipes the
-- previous bullets to keep them strictly in sync with intro_md).
CREATE INDEX IF NOT EXISTS idx_bullets_video_roundup
  ON summary_bullets(video_roundup_id);
