-- Migration 009: Fix sort_order values to be sequential without duplicates.
-- Run once in Supabase SQL Editor.
-- This re-numbers all topics in their current display order (sort_order ASC, then created_at ASC).

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order ASC, created_at ASC) - 1 AS new_order
  FROM topics
)
UPDATE topics
SET sort_order = numbered.new_order
FROM numbered
WHERE topics.id = numbered.id;
