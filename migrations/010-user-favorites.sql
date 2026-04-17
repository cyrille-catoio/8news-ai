-- Migration 010: Per-user article favorites
-- Stores bookmarked articles with denormalized metadata so the favorites
-- page can display them even after the source articles table is pruned.

CREATE TABLE IF NOT EXISTS user_favorites (
  id            serial       PRIMARY KEY,
  user_id       uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_url   text         NOT NULL,
  article_title text         NOT NULL,
  article_source text        NOT NULL DEFAULT '',
  article_date  timestamptz,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT user_favorites_unique UNIQUE (user_id, article_url)
);

CREATE INDEX IF NOT EXISTS user_favorites_user_date_idx
  ON user_favorites (user_id, created_at DESC);

ALTER TABLE user_favorites ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'article';

COMMENT ON TABLE user_favorites IS
  'Per-user bookmarks (articles + videos). article_url is the unique identifier within a user scope.';
