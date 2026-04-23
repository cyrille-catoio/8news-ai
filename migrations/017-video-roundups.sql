-- 017: video_roundups — per-topic-per-day SSR pages aggregating the
--      day's transcribed videos for a topic.
-- Run in Supabase SQL Editor.
--
-- Each row drives a SSR route /{topic}/r/{roundup_date}/{slug_keywords}
-- that lists the videos transcribed on that topic that day, with a
-- GPT-generated intro paragraph + SEO title/description/slug.
--
-- Pre-requisite: migration 016 (video_transcriptions.topic_id and
-- published_date populated) must have run first.

CREATE TABLE IF NOT EXISTS public.video_roundups (
  id              SERIAL PRIMARY KEY,
  topic_id        TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  roundup_date    DATE NOT NULL,
  lang            TEXT NOT NULL CHECK (lang IN ('en', 'fr')),
  slug_keywords   TEXT NOT NULL,
  seo_title       TEXT NOT NULL,
  seo_description TEXT,
  intro_md        TEXT NOT NULL,
  -- Ordered list of `video_transcriptions.video_id` shown on the page.
  -- Stored as TEXT[] (not a join) because the order is editorial and
  -- because the page renders them in that exact order.
  video_ids       TEXT[] NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  -- One roundup per (topic, date, lang) — re-running the generator
  -- updates in place rather than creating a duplicate.
  UNIQUE(topic_id, roundup_date, lang)
);

-- Route resolution: a SELECT by (topic_id, roundup_date, slug_keywords)
-- returns 0 or 1 row. Lang is part of the unique key so EN+FR roundups
-- for the same (topic, date) coexist with different slugs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vr_route
  ON video_roundups(topic_id, roundup_date, lang, slug_keywords);

-- Drives the /briefings hub (Phase 3) — list all roundups across topics
-- ordered by date descending.
CREATE INDEX IF NOT EXISTS idx_vr_recent
  ON video_roundups(roundup_date DESC, lang);

ALTER TABLE public.video_roundups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_roundups FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'video_roundups' AND policyname = 'Public read access') THEN
    CREATE POLICY "Public read access" ON public.video_roundups FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'video_roundups' AND policyname = 'Service role write') THEN
    CREATE POLICY "Service role write" ON public.video_roundups FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
