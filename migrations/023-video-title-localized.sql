-- 023: per-language localized title for video transcriptions.
-- Run in Supabase SQL Editor.
--
-- Why
-- ---
-- The home page (TOP VIDEO + « Toutes les vidéos transcrites » list)
-- shows YouTube titles as-is. Visitors browsing in English see French
-- titles when the source channel is French (and vice versa).
--
-- This migration adds a NULLABLE `title_localized` column to
-- `video_transcriptions`. The transcription pipeline populates it for
-- NEW rows (one short LLM call per (video, lang) — see
-- `translateVideoTitle` in `src/lib/transcribe-video.ts`).
--
-- Existing rows keep `title_localized = NULL` and the read-side falls
-- back to the YouTube title — no backfill, no behavior change for the
-- archive (per product request: « on abandonne l'existant »).
--
-- The unique key on (video_id, lang) already ensures the
-- (video, lang) → title_localized mapping is one-to-one.

ALTER TABLE public.video_transcriptions
  ADD COLUMN IF NOT EXISTS title_localized TEXT;

COMMENT ON COLUMN public.video_transcriptions.title_localized IS
  'Translated video title in the row''s language. NULL on legacy rows; reader falls back to youtube_videos.title in that case.';
