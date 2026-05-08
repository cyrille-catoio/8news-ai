-- 025: pre-computed daily Top articles AI summary snapshot.
-- Run in Supabase SQL Editor.
--
-- Why
-- ---
-- Until now the Top articles page (`/top-articles`) generated its AI
-- summary on-demand: each user click POSTed to `/api/news/top-summary`,
-- which spent OpenAI tokens and made the visitor wait 30-60 s. The
-- replacement model is a once-a-day Netlify background function
-- (`cron-top-summary-background`) that pre-computes the summary for
-- both langs and persists a frozen snapshot here. The page then reads
-- the latest row and renders instantly.
--
-- Snapshot semantics
-- ------------------
-- Every row freezes both the article list (50 rows of metadata used
-- as input to the LLM) and the resulting markdown summary, so the
-- bullets' `refs` are guaranteed to match the displayed article list.
-- One row per (summary_date, lang). Idempotent: a re-tick the same day
-- replaces the row in place.
--
-- Bullets
-- -------
-- Per-bullet detail (text, title, refs, topic) lives in the existing
-- `summary_bullets` table with `source_type='top50'` keyed on
-- (lang, summary_date) — see migrations 011 + 024.
--
-- Read paths
-- ----------
-- Public read access (RLS open) so the GET route can run anonymously.
-- Service role writes only (the cron + the legacy POST debug endpoint).

CREATE TABLE IF NOT EXISTS public.top_summaries (
  summary_date  DATE         NOT NULL,
  lang          TEXT         NOT NULL CHECK (lang IN ('en','fr')),
  generated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  model         TEXT,
  articles      JSONB        NOT NULL,
  summary_md    TEXT         NOT NULL,
  PRIMARY KEY (summary_date, lang)
);

CREATE INDEX IF NOT EXISTS idx_top_summaries_lang_date_desc
  ON public.top_summaries (lang, summary_date DESC);

ALTER TABLE public.top_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON public.top_summaries
  FOR SELECT USING (true);

CREATE POLICY "Service role write" ON public.top_summaries
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.top_summaries IS
  'Pre-computed daily Top articles AI summary snapshot, written by cron-top-summary-background. One row per (summary_date, lang). The page reads the latest row instead of generating on-demand.';
COMMENT ON COLUMN public.top_summaries.articles IS
  'Frozen 50-article snapshot used as input to the LLM. Each entry: { title, link, source, pubDate, snippet, topic, score? }.';
COMMENT ON COLUMN public.top_summaries.summary_md IS
  'Rendered markdown summary returned by analyzeWithAI: per-bullet **Title** + bullet body, joined with blank lines. Mirrored in summary_bullets for structured access.';
