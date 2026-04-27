-- Add cycling and swimming columns to proof_archive
-- Run in Supabase Dashboard > SQL Editor

ALTER TABLE proof_archive ADD COLUMN IF NOT EXISTS cycle_km NUMERIC(6,2);
ALTER TABLE proof_archive ADD COLUMN IF NOT EXISTS cycle_time_sec INTEGER;
ALTER TABLE proof_archive ADD COLUMN IF NOT EXISTS swim_km NUMERIC(6,2);
ALTER TABLE proof_archive ADD COLUMN IF NOT EXISTS swim_time_sec INTEGER;
ALTER TABLE proof_archive ADD COLUMN IF NOT EXISTS activities JSONB DEFAULT '[]';

-- Add tomorrow_plan table for 2MRP feature
CREATE TABLE IF NOT EXISTS tomorrow_plan (
  date DATE PRIMARY KEY,
  tasks JSONB DEFAULT '[]',
  executed_pct INTEGER DEFAULT 0,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for new table
ALTER TABLE tomorrow_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_access ON tomorrow_plan FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);