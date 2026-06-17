-- Migration 039: Community chat messages (user-to-user)
--
-- Backs the « Community chat » left-side panel (v2.14+). Unlike the Daily
-- Podcast chat (mig. 033, a private 1-user ↔ AI thread, service-role only),
-- this is a single global public room where signed-in members talk to each
-- other. No AI participant for now (planned later).
--
-- Design notes:
--  - One row per message, one global room (no `room_id` column yet — a
--    future « channels » feature would add one). Ordered by `created_at`,
--    the BIGSERIAL `id` breaks ties so rapid-fire messages keep their order.
--  - `display_name` is denormalized on the row at post time (nickname →
--    first_name → « Anonymous »). There is no `profiles` table; the profile
--    lives in `auth.users.user_metadata`, so we snapshot the chosen name
--    here rather than join on every read.
--  - `lang` records the UI language the message was posted in (analytics).
--  - RLS: PUBLIC read (anon + authenticated) so the room is visible to
--    everyone and Supabase Realtime can fan out INSERTs to every connected
--    client. Writes go exclusively through `/api/user-chat` with the
--    service role (validation + trusted `user_id`/`display_name`), so NO
--    write policy is granted to anon/authenticated.
--  - Realtime: the table is added to the `supabase_realtime` publication so
--    the panel can subscribe to INSERT events. Default replica identity is
--    enough (we only consume the new row on INSERT).

CREATE TABLE IF NOT EXISTS public.user_chat_messages (
  id            BIGSERIAL    PRIMARY KEY,
  user_id       UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT         NOT NULL,
  content       TEXT         NOT NULL,
  lang          TEXT         NOT NULL CHECK (lang IN ('en', 'fr')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Primary read pattern: « give me the most recent N messages in order ».
CREATE INDEX IF NOT EXISTS user_chat_messages_created_idx
  ON public.user_chat_messages (created_at, id);

ALTER TABLE public.user_chat_messages ENABLE ROW LEVEL SECURITY;

-- Public read: anyone (anonymous included) can read the room. Realtime
-- checks this policy per subscribing client before fanning out a change.
DROP POLICY IF EXISTS "Public read" ON public.user_chat_messages;
CREATE POLICY "Public read" ON public.user_chat_messages
  FOR SELECT USING (true);

-- No INSERT/UPDATE/DELETE policy on purpose: writes only via the service
-- role (which bypasses RLS) through /api/user-chat.

-- Expose INSERTs to Supabase Realtime subscribers.
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_chat_messages;

COMMENT ON TABLE public.user_chat_messages IS
  'Community chat messages (v2.14+). Single global public room, user-to-user. Public SELECT (Realtime fan-out); writes only via /api/user-chat with the service role. display_name is snapshotted from user_metadata at post time.';
