-- 019: articles gain title_ai_en / title_ai_fr — translated titles produced
-- alongside the existing snippet_ai_en / snippet_ai_fr by the scoring pipeline
-- (`src/lib/score-topic-dynamic.ts`). Used by the home « Top story » hero on
-- /app to render the title in the user's selected language instead of the raw
-- feed title (which is locked to the source publication's language).
--
-- Backward-compat: nullable. The Top story endpoint falls back to the original
-- `title` when the AI translation hasn't been produced yet (legacy rows scored
-- before this migration, articles scoring < 5 where the AI summary is skipped).
-- Run in Supabase SQL Editor.

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS title_ai_en text,
  ADD COLUMN IF NOT EXISTS title_ai_fr text;
