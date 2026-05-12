-- ═══════════════════════════════════════════
-- FIRST LIGHT — FINANCIAL FORTRESS TABLES
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════

-- expense_log: one row per expense entry
CREATE TABLE IF NOT EXISTS expense_log (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  payment_mode TEXT DEFAULT 'UPI',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- income_log: one row per income entry
CREATE TABLE IF NOT EXISTS income_log (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  source TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- investment_log: one row per investment
CREATE TABLE IF NOT EXISTS investment_log (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  units NUMERIC(15,4),
  nav NUMERIC(12,4),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- finance_budgets: one row per category (monthly targets)
CREATE TABLE IF NOT EXISTS finance_budgets (
  category TEXT PRIMARY KEY,
  monthly_budget NUMERIC(12,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast date queries
CREATE INDEX IF NOT EXISTS idx_expense_log_date ON expense_log(date);
CREATE INDEX IF NOT EXISTS idx_income_log_date ON income_log(date);
CREATE INDEX IF NOT EXISTS idx_investment_log_date ON investment_log(date);

-- Enable RLS (private financial data — authenticated only)
ALTER TABLE expense_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_budgets ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users have full access
DROP POLICY IF EXISTS "auth only" ON expense_log;
DROP POLICY IF EXISTS "auth only" ON income_log;
DROP POLICY IF EXISTS "auth only" ON investment_log;
DROP POLICY IF EXISTS "auth only" ON finance_budgets;

CREATE POLICY "auth only" ON expense_log FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth only" ON income_log FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth only" ON investment_log FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth only" ON finance_budgets FOR ALL USING (auth.role() = 'authenticated');
