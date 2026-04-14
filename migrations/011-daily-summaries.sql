-- Migration 011: Daily AI summaries for SEO pages + individual bullet storage
-- Run this in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS daily_summaries (
  id             SERIAL       PRIMARY KEY,
  topic_id       TEXT         NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  summary_date   DATE         NOT NULL,
  lang           TEXT         NOT NULL DEFAULT 'en' CHECK (lang IN ('en', 'fr')),
  slug_keywords  TEXT         NOT NULL,

  bullets        JSONB        NOT NULL DEFAULT '[]',
  articles       JSONB        NOT NULL DEFAULT '[]',
  meta           JSONB,

  seo_title       TEXT        NOT NULL DEFAULT '',
  seo_description TEXT        NOT NULL DEFAULT '',
  seo_h1          TEXT        NOT NULL DEFAULT '',

  period_from    TIMESTAMPTZ  NOT NULL,
  period_to      TIMESTAMPTZ  NOT NULL,
  created_at     TIMESTAMPTZ  DEFAULT NOW(),

  UNIQUE(topic_id, summary_date, lang)
);

CREATE INDEX IF NOT EXISTS idx_daily_summaries_topic_date
  ON daily_summaries(topic_id, summary_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_summaries_slug
  ON daily_summaries(topic_id, summary_date, slug_keywords);

CREATE TABLE IF NOT EXISTS summary_bullets (
  id                SERIAL    PRIMARY KEY,
  daily_summary_id  INT       NOT NULL REFERENCES daily_summaries(id) ON DELETE CASCADE,
  topic_id          TEXT      NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  lang              TEXT      NOT NULL CHECK (lang IN ('en', 'fr')),
  summary_date      DATE      NOT NULL,
  bullet_index      SMALLINT  NOT NULL,
  text              TEXT      NOT NULL,
  refs              JSONB     NOT NULL DEFAULT '[]',
  entities          TEXT[]    NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bullets_topic_date
  ON summary_bullets(topic_id, summary_date DESC);
CREATE INDEX IF NOT EXISTS idx_bullets_entity
  ON summary_bullets USING GIN(entities);
CREATE INDEX IF NOT EXISTS idx_bullets_daily_summary
  ON summary_bullets(daily_summary_id);

ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE summary_bullets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON daily_summaries
  FOR SELECT USING (true);
CREATE POLICY "Public read access" ON summary_bullets
  FOR SELECT USING (true);

CREATE POLICY "Service role write" ON daily_summaries
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role write" ON summary_bullets
  FOR ALL USING (auth.role() = 'service_role');
