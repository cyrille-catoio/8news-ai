-- Migration 029: Per-user UI activity log
--
-- Generic key/value/timestamp store for tracking which UI interactions an
-- authenticated user has performed. v2.8.2+ first consumer is the home
-- `Top 24h` podcast « Lu / Read » checkbox: one row per (user, podcast
-- snapshot date) lets the hero collapse when revisited and lets the read
-- state persist across devices / browsers — replacing the previous
-- `top24hRead` cookie that only tracked « today's » podcast.
--
-- Design notes:
--  - `activity_type` is the discriminator (e.g. `'podcast_read'`). Adding
--    new tracked surfaces later does not require a schema change — just
--    pick a new discriminator and reuse this table.
--  - `target_id` is a free-form text key that identifies WHAT was acted
--    upon. For `'podcast_read'` we use the snapshot date `YYYY-MM-DD`;
--    other consumers can use article URLs, video IDs, etc.
--  - `value` is a SMALLINT toggle state (0 = off / unread, 1 = on /
--    read). Kept numeric rather than boolean so future activities can
--    use richer enums without a column rewrite.
--  - `last_action` records the literal interface action the user took
--    on their last click (e.g. `'mark_read'`, `'unmark_read'`). Useful
--    for audit trails and future analytics.
--  - UNIQUE (user_id, activity_type, target_id) makes upserts cheap and
--    keeps the table from growing unbounded per (user, target) tuple.

CREATE TABLE IF NOT EXISTS user_activity (
  id              BIGSERIAL    PRIMARY KEY,
  user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type   TEXT         NOT NULL,
  target_id       TEXT         NOT NULL,
  value           SMALLINT     NOT NULL DEFAULT 1,
  last_action     TEXT         NOT NULL,
  last_clicked_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT user_activity_unique UNIQUE (user_id, activity_type, target_id),
  CONSTRAINT user_activity_value_chk CHECK (value IN (0, 1))
);

-- Batch lookup pattern: « give me every podcast_read row for this user »
-- so the hero can render the correct collapsed/expanded state for any
-- snapshot the visitor browses to via the history arrows.
CREATE INDEX IF NOT EXISTS user_activity_user_type_idx
  ON user_activity (user_id, activity_type);

-- Service-role-only RLS (consistent with `user_favorites`,
-- `user_topic_preferences`, and the rest of the per-user tables —
-- every read/write goes through `/api/user/activity` with the service
-- key).
ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity FORCE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.user_activity
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE user_activity IS
  'Per-user UI activity log. (activity_type, target_id) is the kind/target tuple; value is the current toggle state; last_action records the literal interface action. First consumer: home Top 24h podcast « Lu / Read » checkbox.';
