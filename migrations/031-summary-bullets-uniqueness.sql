-- Migration 031: UNIQUE business-key constraints on `summary_bullets`
--
-- IMPORTANT — RUN ORDER: this migration MUST be applied AFTER
-- `032-summary-bullets-cleanup.sql`. The filename number is lower for
-- historical reasons, but the cleanup migration must purge the
-- existing duplicates first, otherwise `ALTER TABLE … ADD CONSTRAINT
-- UNIQUE` would fail on the residue.
--
-- Why these constraints. The four `summary_bullets` writers
-- (`generate-daily-summary.ts`, `generate-top-summary.ts`,
-- `generate-video-roundup.ts`, `transcribe-video.ts` via the cron-only
-- `persistBullets` path) all use a delete-then-insert pattern scoped to
-- their parent grouping. Until v2.10.3 nothing at the DB level guarded
-- against concurrent ticks interleaving two delete+insert cycles for the
-- same parent — a low-probability but real race. These UNIQUE
-- constraints turn that race into a hard conflict instead of silent
-- duplicate rows.
--
-- `DEFERRABLE INITIALLY DEFERRED` lets a delete-then-insert inside the
-- same transaction stay valid: the constraint is only checked at COMMIT
-- time, so the transient state right after DELETE (where the « new »
-- rows haven't been inserted yet, but the « old » rows are already
-- gone) doesn't blow up. Plain insert paths without DELETE still get
-- the same protection — Postgres only defers, it never relaxes.
--
-- Top 24h (`source_type='top50'`) is intentionally NOT covered. That
-- pipeline fans a single editorial bullet across N topic rows; a
-- (lang, summary_date, bullet_index) tuple legitimately has multiple
-- rows. Readers deduplicate at query time
-- (`getTopSummaryBulletsByDate`). Adding a UNIQUE constraint here
-- would break the multi-topic fan-out by design.
-- v2.10.3+.

-- Daily SEO summary bullets.
ALTER TABLE summary_bullets
  ADD CONSTRAINT summary_bullets_daily_unique
  UNIQUE (daily_summary_id, bullet_index)
  DEFERRABLE INITIALLY DEFERRED;

-- Per-topic-per-day video roundup bullets.
ALTER TABLE summary_bullets
  ADD CONSTRAINT summary_bullets_roundup_unique
  UNIQUE (video_roundup_id, bullet_index)
  DEFERRABLE INITIALLY DEFERRED;

-- Per-video AI summary bullets.
ALTER TABLE summary_bullets
  ADD CONSTRAINT summary_bullets_video_unique
  UNIQUE (video_transcription_id, bullet_index)
  DEFERRABLE INITIALLY DEFERRED;
