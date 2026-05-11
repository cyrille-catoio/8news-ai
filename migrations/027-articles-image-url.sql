-- 027: articles gain image_url — RSS hero / enclosure / first <img> in
-- item content, persisted by `fetch-topic-dynamic.ts` on ingest.
-- Nullable: legacy rows and feeds without artwork stay unchanged.
-- Run in Supabase SQL Editor.

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS image_url text;
