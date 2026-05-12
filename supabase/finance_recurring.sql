-- ═══════════════════════════════════════════
-- FIRST LIGHT — RECURRING BILLS TABLE
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS finance_recurring (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'others',
  amount NUMERIC(12,2) NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'MONTHLY',  -- MONTHLY | QUARTERLY | ANNUAL
  due_day INTEGER,        -- day of month (1-31)
  due_month INTEGER,      -- month (1-12) for annual bills
  active BOOLEAN DEFAULT true,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE finance_recurring ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth only" ON finance_recurring;
CREATE POLICY "auth only" ON finance_recurring FOR ALL USING (auth.role() = 'authenticated');
