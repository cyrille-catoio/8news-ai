-- Migration 030: Append-only UI event log
--
-- v2.10+ adds a sibling table to `user_activity` (mig. 029) for
-- high-cardinality interaction tracking. Where `user_activity` stores
-- ONE row per (user, type, target) for state toggles (podcast read,
-- newsletter on/off…), `user_event` is **append-only**: every click,
-- play, navigation step gets its own row with a precise timestamp,
-- enabling time-of-day heatmaps, exact funnels, retention cohorts and
-- anonymous-visitor analytics.
--
-- Both surfaces are populated:
--  - Authenticated visitors → `user_id` is set, `visitor_id` NULL.
--  - Anonymous visitors → `user_id` NULL, `visitor_id` set to the
--    client-generated UUID stored in the `visitor_id` cookie. This lets
--    us measure pre-signup engagement and the anonymous → auth
--    conversion funnel.
--
-- Design notes:
--  - `event_type` uses a dot-namespaced convention (`top24h.group_expand`,
--    `favorite.add`, `nav.menu`…) so the type discriminator stays
--    self-describing without an extra `event_category` column.
--  - `action` is the optional sub-discriminator (`'older'`/`'newer'`,
--    `'play'`/`'pause'`, `'add'`/`'remove'`) — splitting it out of
--    `event_type` keeps the cardinality of the primary discriminator
--    small enough for stats aggregations.
--  - `target_id` is intentionally TEXT (not FK) because it spans
--    snapshot dates, video ids, article URLs, topic ids and pill names.
--  - `meta` JSONB is the escape hatch for richer payloads (position
--    seconds, batch offset, source name…). Keeping it OPT-IN means most
--    rows are skinny and the table compresses well.
--  - `path` records the URL where the event happened — needed for
--    cross-checks (is the user clicking from the home or from the SSR
--    archive page?).
--  - `lang` captures the UI language at event time, since user
--    `preferred_lang` can flip mid-session.
--  - Foreign-key constraint uses `ON DELETE SET NULL` so if a user
--    deletes their account, their event rows survive (de-identified to
--    NULL) for aggregate analytics — matches GDPR-friendly « right to
--    erasure » without losing the historical signal.
--  - The CHECK constraint guarantees every row is attributable to
--    either a user or an anonymous visitor (or both during a session
--    that started anonymous and then signed in).

CREATE TABLE IF NOT EXISTS user_event (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     UUID         NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  visitor_id  TEXT         NULL,
  event_type  TEXT         NOT NULL,
  target_id   TEXT         NULL,
  action      TEXT         NULL,
  lang        TEXT         NULL,
  path        TEXT         NULL,
  meta        JSONB        NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT user_event_attribution_chk
    CHECK (user_id IS NOT NULL OR visitor_id IS NOT NULL)
);

-- Index strategy ──────────────────────────────────────────────────────
--  1. (event_type, created_at DESC) — primary aggregation pattern
--     (« events of type X in the last 30 days »).
--  2. (user_id, created_at DESC) WHERE user_id IS NOT NULL — per-user
--     timelines for the leaderboard + retention cohorts. Partial index
--     keeps it lean since ~half the rows are anonymous.
--  3. (visitor_id, created_at DESC) WHERE visitor_id IS NOT NULL — same
--     pattern for anonymous journeys (e.g. visitor X opened the home
--     hero 5×, then signed up — the anon→auth funnel needs this).
--  4. (created_at DESC) — global timeline / DAU / time-of-day heatmap.
--  5. (event_type, target_id) — « top content by event_type » (top
--     played videos, top favorited URLs…).

CREATE INDEX IF NOT EXISTS user_event_type_created_idx
  ON user_event (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS user_event_user_created_idx
  ON user_event (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_event_visitor_created_idx
  ON user_event (visitor_id, created_at DESC)
  WHERE visitor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_event_created_idx
  ON user_event (created_at DESC);

CREATE INDEX IF NOT EXISTS user_event_type_target_idx
  ON user_event (event_type, target_id);

-- Service-role-only RLS (consistent with `user_activity`,
-- `user_favorites`, `user_topic_preferences` — every read/write goes
-- through `/api/user/event` with the service key).
ALTER TABLE public.user_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_event FORCE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.user_event
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE user_event IS
  'Append-only UI event log. Every interesting interaction (auth, podcast expand, history nav, favorite, audio play, nav click…) is recorded with timestamp + context. Attributable to a user_id (authenticated) or visitor_id (anonymous cookie). Powers the owner-only « User Activity » stats page.';
