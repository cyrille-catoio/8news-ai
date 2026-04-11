-- Migration 007: Per-user topic personalization
-- Stores the list of topic IDs a user wants to see.
-- An empty array means "no preference" (same as no row) = show all topics.

CREATE TABLE IF NOT EXISTS user_topic_preferences (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_ids  text[]      NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

COMMENT ON TABLE user_topic_preferences IS
  'Stores the ordered list of topic IDs a user wants to see. An empty array means "show all" (same as no row).';
