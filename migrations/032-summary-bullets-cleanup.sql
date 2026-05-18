-- Migration 032: Clean up historical `summary_bullets` rows
--
-- Two operations, ordered carefully:
--
--   1. Normalize `source_type` for daily-summary bullets.
--      The DB default since mig. 014 has been `'article'`, and the
--      writer never set the column explicitly. v2.10.3+ writes the
--      explicit value `'daily_summary'` from `generateDailySummary`;
--      this step backfills the legacy rows. We restrict the UPDATE
--      to rows where `daily_summary_id IS NOT NULL` so we don't
--      touch any future legitimate `'article'` row that might be
--      added by a different writer.
--
--   2. De-duplicate per business key.
--      No UNIQUE constraint has ever guarded the four parent
--      groupings, so concurrent cron ticks could in principle have
--      written multiple rows for the same logical bullet. Keeping
--      the row with the smallest `id` (= earliest write) is the
--      safest choice — it preserves the original write timestamp
--      and lets future reads remain stable.
--
-- This migration MUST run BEFORE 031 (UNIQUE constraints), otherwise
-- the ALTER TABLE in 031 would fail on the duplicate residue.
-- v2.10.3+.

-- ── 1. source_type normalization ─────────────────────────────────────
UPDATE summary_bullets
SET source_type = 'daily_summary'
WHERE source_type = 'article'
  AND daily_summary_id IS NOT NULL;

-- ── 2. Dedup by business key ─────────────────────────────────────────
-- Daily summary: one bullet per (daily_summary_id, bullet_index).
DELETE FROM summary_bullets a
USING summary_bullets b
WHERE a.id > b.id
  AND a.daily_summary_id IS NOT NULL
  AND a.daily_summary_id = b.daily_summary_id
  AND a.bullet_index = b.bullet_index;

-- Video roundup: one bullet per (video_roundup_id, bullet_index).
DELETE FROM summary_bullets a
USING summary_bullets b
WHERE a.id > b.id
  AND a.video_roundup_id IS NOT NULL
  AND a.video_roundup_id = b.video_roundup_id
  AND a.bullet_index = b.bullet_index;

-- Video: one bullet per (video_transcription_id, bullet_index).
DELETE FROM summary_bullets a
USING summary_bullets b
WHERE a.id > b.id
  AND a.video_transcription_id IS NOT NULL
  AND a.video_transcription_id = b.video_transcription_id
  AND a.bullet_index = b.bullet_index;

-- Note: Top 24h rows (`source_type = 'top50'`) are intentionally NOT
-- deduplicated here. The Top 24h pipeline fans a single editorial
-- bullet across N topics, producing legitimate multi-rows per
-- (lang, summary_date, bullet_index); downstream readers
-- (`getTopSummaryBulletsByDate`) deduplicate by `bullet_index` at
-- query time. Adding a UNIQUE constraint here would break that
-- multi-topic fan-out. See `src/lib/generate-top-summary.ts`.

COMMENT ON COLUMN summary_bullets.source_type IS
  'Writer discriminator. Valid values: ''daily_summary'' (per-topic SEO summaries, mig 011 default ''article'' before 032), ''top50'' (Top articles 24h, mig 025), ''video'' (per-video AI summary, mig 014), ''video_roundup'' (per-topic-per-day video roundup, mig 018). Each writer is exclusively a CRON background function since v2.10.3.';
