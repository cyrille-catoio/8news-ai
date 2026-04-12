-- Migration 008: Create categories table and add category_id FK on topics
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS categories (
  id          serial PRIMARY KEY,
  slug        text UNIQUE NOT NULL,
  label_en    text NOT NULL,
  label_fr    text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO categories (slug, label_en, label_fr, sort_order) VALUES
  ('technology', 'Technology', 'Technologie', 1),
  ('health', 'Health', 'Santé', 2),
  ('sport', 'Sport', 'Sport', 3);

ALTER TABLE topics ADD COLUMN IF NOT EXISTS category_id integer
  REFERENCES categories(id) ON DELETE SET NULL DEFAULT 1;
