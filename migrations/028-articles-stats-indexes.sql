-- 028: stats dashboard indexes on `articles`.
-- Run in Supabase SQL Editor.
--
-- Why
-- ---
-- v2.6.14 reworked `/api/stats` so the topic + days filters are pushed
-- down to Postgres (instead of pulling the entire `articles` table and
-- filtering in JS). The new query pattern is:
--
--   SELECT … FROM articles WHERE topic = $1 AND pub_date >= $2 ORDER BY id;
--
-- For that to actually be fast on a production database with 50K+
-- articles, Postgres needs a composite index on `(topic, pub_date)`.
-- A separate `(pub_date)` index also helps the `topic = "all"`
-- pre-filter (KPI block for « all topics + last 24 h »).
--
-- Idempotent — `IF NOT EXISTS` makes both statements safe to re-run.
-- On a brand-new database where the indexes are still being built,
-- this migration is a no-op for the application; the indexes catch up
-- in the background.

CREATE INDEX IF NOT EXISTS idx_articles_topic_pubdate
  ON public.articles (topic, pub_date DESC);

CREATE INDEX IF NOT EXISTS idx_articles_pub_date
  ON public.articles (pub_date DESC);

COMMENT ON INDEX public.idx_articles_topic_pubdate IS
  'Covers the per-topic + period stats queries powering /api/stats (push-down filters since v2.6.14). Also useful for any /api/news?topic=X&hours=Y read path.';
COMMENT ON INDEX public.idx_articles_pub_date IS
  'Covers all-topic + period stats queries when the user selects « all topics + last N days » on the stats page.';
