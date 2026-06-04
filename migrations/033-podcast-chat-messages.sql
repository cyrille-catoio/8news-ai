-- Migration 033: Daily Podcast chat messages
--
-- Backs the collapsible « Daily Podcast » chat side panel (v2.13+). The
-- panel lets an authenticated user ask questions about the day's Top 24h
-- podcast; the answer is grounded in that day's `top_summaries` snapshot
-- (full text + per-topic notes + source links) plus the running
-- conversation of the day.
--
-- Design notes:
--  - One row per chat message. A conversation is the set of rows sharing
--    `(user_id, summary_date)` ordered by `created_at` — there is no
--    separate « conversation » table, the (user, podcast day) tuple IS
--    the conversation key. This makes the « daily reset » free: a new
--    `summary_date` naturally starts a fresh thread.
--  - `role` is the OpenAI chat role: 'user' (the question) or
--    'assistant' (the model answer). The grounding system prompt is NOT
--    persisted — it is rebuilt server-side from the snapshot on every
--    call so it always reflects the current briefing.
--  - `lang` records the UI language the message was produced in, so a
--    future analytics pass can split usage EN vs FR.
--  - Service-role-only RLS (consistent with `user_activity`,
--    `user_favorites`, `user_topic_preferences` — every read/write goes
--    through `/api/podcast-chat` with the service key).

CREATE TABLE IF NOT EXISTS public.podcast_chat_messages (
  id            BIGSERIAL    PRIMARY KEY,
  user_id       UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_date  DATE         NOT NULL,
  lang          TEXT         NOT NULL CHECK (lang IN ('en', 'fr')),
  role          TEXT         NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Primary read pattern: « give me this user's conversation for this
-- podcast day, in order ». BIGSERIAL id ties the order on equal
-- timestamps so a question + its answer never swap.
CREATE INDEX IF NOT EXISTS podcast_chat_messages_user_date_idx
  ON public.podcast_chat_messages (user_id, summary_date, created_at, id);

ALTER TABLE public.podcast_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_chat_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.podcast_chat_messages
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.podcast_chat_messages IS
  'Daily Podcast chat messages (v2.13+). One row per message; a conversation = rows sharing (user_id, summary_date) ordered by created_at. Answers are grounded server-side in that day''s top_summaries snapshot. Service-role-only access via /api/podcast-chat.';
