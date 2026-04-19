-- 015: Guard daily_summaries.slug_keywords format to prevent broken SEO routes.
-- Keeps old rows untouched (NOT VALID) while enforcing new/updated rows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'daily_summaries_slug_keywords_format_chk'
  ) THEN
    ALTER TABLE daily_summaries
      ADD CONSTRAINT daily_summaries_slug_keywords_format_chk
      CHECK (
        slug_keywords ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        AND char_length(slug_keywords) <= 80
      )
      NOT VALID;
  END IF;
END $$;
