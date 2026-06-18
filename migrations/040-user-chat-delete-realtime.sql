-- Migration 040: Community chat DELETE realtime reliability
--
-- The Community chat already subscribes to INSERT and DELETE events on
-- `user_chat_messages`. INSERT works with the default replica identity,
-- but DELETE payloads are safer and more complete when Postgres logs the
-- full old row. This guarantees the browser can read `payload.old.id`
-- and remove the deleted message from every open panel.
--
-- Manual Supabase migration: run this after 039.

ALTER TABLE public.user_chat_messages REPLICA IDENTITY FULL;

COMMENT ON TABLE public.user_chat_messages IS
  'Community chat messages (v2.14+). Single global public room, user-to-user. Public SELECT (Realtime fan-out); writes/deletes only via /api/user-chat with the service role. REPLICA IDENTITY FULL lets Realtime DELETE payloads include the deleted row id for cross-client removal.';
