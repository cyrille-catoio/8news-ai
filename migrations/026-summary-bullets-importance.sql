-- 026: per-group editorial importance score (1-10) on summary_bullets.
-- Run in Supabase SQL Editor.
--
-- Why
-- ---
-- The Top 24h home block (rendered by `Top24hHero`) groups consecutive
-- `summary_bullets` rows that share the same `title` into a single
-- editorial story (~6-12 stories per snapshot). Each story has a real
-- editorial weight that the LLM is in the best position to judge — a
-- breaking-news event has a different importance from an opinion
-- piece. We surface this as a ScoreMeter (1-10) on each story header,
-- replacing the previously displayed paragraph counter.
--
-- Why on `summary_bullets` (not `top_summaries`)
-- ----------------------------------------------
-- One `top_summaries` row holds the full snapshot blob; one
-- `summary_bullets` row is one paragraph. The score is per-group, but
-- groups don't have their own table — they're materialised in the UI
-- by folding consecutive rows that share `title`. The simplest faithful
-- mapping is therefore to denormalise the score onto each row of a
-- group (every row of a same-title run carries the same value, exactly
-- like the `title` column itself). The flattener in `ai-analyze.ts`
-- already propagates the group title; it now propagates the score too.
--
-- Backwards compatibility
-- ----------------------
-- `importance_score` is NULLABLE. Existing rows from older runs (and
-- non-top50 source types — articles, video roundups, etc.) stay NULL,
-- and the UI hides the meter when null. The next `cron-top-summary`
-- tick repopulates the latest snapshot with scores; no backfill is
-- required.
--
-- Defensive CHECK keeps the score either NULL or in [1, 10] so a
-- malformed JSON response from the LLM can't smuggle a 12 or a -3.

ALTER TABLE public.summary_bullets
  ADD COLUMN IF NOT EXISTS importance_score SMALLINT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'summary_bullets'
      AND column_name = 'importance_score'
      AND constraint_name = 'summary_bullets_importance_score_range'
  ) THEN
    ALTER TABLE public.summary_bullets
      ADD CONSTRAINT summary_bullets_importance_score_range
      CHECK (importance_score IS NULL OR (importance_score BETWEEN 1 AND 10));
  END IF;
END $$;

COMMENT ON COLUMN public.summary_bullets.importance_score IS
  'Editorial importance 1-10 for Top 24h groups. NULL on legacy rows and non-top50 sources. Propagated by `analyzeWithAI` flatten so every row of a same-title run shares the value, mirroring the `title` column.';
