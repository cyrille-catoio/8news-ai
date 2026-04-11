-- Migration 006: Add is_displayed column to topics
-- Controls homepage topic button visibility. Crons still fetch/score when is_displayed=false.
-- Run this in Supabase SQL Editor.

ALTER TABLE topics ADD COLUMN IF NOT EXISTS is_displayed boolean NOT NULL DEFAULT true;
