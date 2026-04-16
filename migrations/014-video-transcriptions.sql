-- 014: Video transcriptions + summary_bullets source_type + youtube_videos cache
-- Run in Supabase SQL Editor.

-- 0. Cache table for YouTube video metadata (persists videos for past date lookups)
CREATE TABLE IF NOT EXISTS public.youtube_videos (
  video_id      TEXT PRIMARY KEY,
  channel_id    TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  published     TIMESTAMPTZ NOT NULL,
  published_date DATE NOT NULL,
  thumbnail     TEXT,
  view_count    TEXT,
  duration_sec  INT,
  link          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE youtube_videos
  ADD COLUMN IF NOT EXISTS topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_youtube_videos_date
  ON youtube_videos(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_youtube_videos_channel
  ON youtube_videos(channel_id, published_date DESC);

ALTER TABLE public.youtube_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_videos FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'youtube_videos' AND policyname = 'Public read access') THEN
    CREATE POLICY "Public read access" ON public.youtube_videos FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'youtube_videos' AND policyname = 'Service role write') THEN
    CREATE POLICY "Service role write" ON public.youtube_videos FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- 1. New table for video transcriptions
CREATE TABLE IF NOT EXISTS public.video_transcriptions (
  id            SERIAL PRIMARY KEY,
  video_id      TEXT NOT NULL,
  channel_id    TEXT NOT NULL,
  title         TEXT NOT NULL,
  lang          TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('en', 'fr')),
  transcript    TEXT NOT NULL,
  summary_md    TEXT NOT NULL DEFAULT '',
  word_count    INT,
  topic_id      TEXT REFERENCES topics(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, lang)
);

CREATE INDEX IF NOT EXISTS idx_video_transcriptions_video
  ON video_transcriptions(video_id);

ALTER TABLE public.video_transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_transcriptions FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'video_transcriptions' AND policyname = 'Public read access') THEN
    CREATE POLICY "Public read access" ON public.video_transcriptions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'video_transcriptions' AND policyname = 'Service role write') THEN
    CREATE POLICY "Service role write" ON public.video_transcriptions FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- 2. Extend summary_bullets: add source_type + video_transcription_id, make daily_summary_id nullable
ALTER TABLE summary_bullets
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'article';

ALTER TABLE summary_bullets
  ADD COLUMN IF NOT EXISTS video_transcription_id INT REFERENCES video_transcriptions(id) ON DELETE CASCADE;

ALTER TABLE summary_bullets
  ALTER COLUMN daily_summary_id DROP NOT NULL;

ALTER TABLE summary_bullets
  ALTER COLUMN topic_id DROP NOT NULL;

-- 3. Patch existing rows (all current bullets come from articles)
UPDATE summary_bullets SET source_type = 'article' WHERE source_type = 'article';
