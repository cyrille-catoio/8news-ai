-- 024: per-bullet short title on `summary_bullets`.
-- Run in Supabase SQL Editor.
--
-- Why
-- ---
-- The Top articles AI summary (`POST /api/news/top-summary`,
-- source_type='top50') now produces a short journalistic title for
-- each bullet (3-8 words, anchored on a proper noun / product / key
-- figure). The title is rendered in bold above the bullet body in the
-- markdown returned to the client AND embedded as a bold heading in
-- the persisted `text` column. We also store it in its own column so
-- downstream consumers can read just the title without parsing
-- markdown.
--
-- Backwards compat
-- ----------------
-- The column is NULLABLE: every existing row (top50 / video / roundup
-- / daily-summary bullets) keeps `title = NULL`. The Top articles
-- pipeline is the only writer for now; legacy bullets are not
-- backfilled — the read-side already renders them fine without a
-- title.

ALTER TABLE public.summary_bullets
  ADD COLUMN IF NOT EXISTS title TEXT;

COMMENT ON COLUMN public.summary_bullets.title IS
  'Short journalistic title for the bullet (3-8 words). NULL on legacy rows and on bullets whose pipeline does not produce a title (video / roundup / per-topic daily). Currently populated only by the Top articles pipeline (source_type=''top50'').';
