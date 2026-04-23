-- 016: video_transcriptions slug + published_date for SSR per-video pages
-- Run in Supabase SQL Editor.
--
-- Adds the two columns required by the new SSR route
-- /{topic}/v/{date}/{slug}, plus the indexes that resolve a route in a
-- single SELECT and that drive the "recent videos for this topic" block.
--
-- Backwards compatible: both columns are nullable. Existing rows are
-- backfilled by the published_date UPDATE here (sourced from
-- youtube_videos), and by `node scripts/backfill-video-slugs.mjs` for
-- slug_keywords (and topic_id when the channel has a topic).

ALTER TABLE video_transcriptions
  ADD COLUMN IF NOT EXISTS slug_keywords TEXT,
  ADD COLUMN IF NOT EXISTS published_date DATE;

-- Backfill published_date from youtube_videos so the new index is
-- immediately useful for already-transcribed videos.
UPDATE video_transcriptions vt
SET published_date = yv.published_date
FROM youtube_videos yv
WHERE vt.video_id = yv.video_id
  AND vt.published_date IS NULL;

-- Route resolution index: a SELECT by (topic_id, published_date, slug_keywords)
-- returns 0 or 1 row. Lang is intentionally part of the unique key so two
-- accidentally-identical slugs in EN and FR for the same (topic, date)
-- can coexist; in practice they never collide (different keywords).
CREATE UNIQUE INDEX IF NOT EXISTS idx_vt_route
  ON video_transcriptions(topic_id, published_date, lang, slug_keywords)
  WHERE slug_keywords IS NOT NULL AND topic_id IS NOT NULL;

-- "Latest videos transcribed in this topic" — drives the SSR sidebar
-- block on /{topic}/v/{date}/{slug}.
CREATE INDEX IF NOT EXISTS idx_vt_topic_recent
  ON video_transcriptions(topic_id, published_date DESC);
