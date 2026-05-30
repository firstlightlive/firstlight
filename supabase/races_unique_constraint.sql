-- Add unique constraint on races.date to prevent duplicate races on same date
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)

-- First check for duplicates (should return empty if clean)
SELECT date, COUNT(*) as cnt FROM races GROUP BY date HAVING COUNT(*) > 1;

-- Add unique constraint
ALTER TABLE races ADD CONSTRAINT races_date_unique UNIQUE (date);

-- Verify
SELECT conname FROM pg_constraint WHERE conrelid = 'races'::regclass AND contype = 'u';
