-- ═══════════════════════════════════════════
-- FIRST LIGHT — FIRE + NET WORTH + ANNUAL BUDGETS
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════

-- Annual budgets (fixes data loss risk — was localStorage only)
CREATE TABLE IF NOT EXISTS finance_annual_budgets (
  year INTEGER NOT NULL,
  category TEXT NOT NULL,
  annual_budget NUMERIC(14,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (year, category)
);

-- Net worth monthly snapshots
CREATE TABLE IF NOT EXISTS finance_networth (
  id TEXT PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  -- LIQUID
  bank_cash NUMERIC(14,2) DEFAULT 0,
  -- FIXED INCOME
  fd NUMERIC(14,2) DEFAULT 0,
  ppf_epf NUMERIC(14,2) DEFAULT 0,
  bonds NUMERIC(14,2) DEFAULT 0,
  -- MARKET (current value, not cost basis)
  mf_value NUMERIC(14,2) DEFAULT 0,
  stocks_india NUMERIC(14,2) DEFAULT 0,
  nps_value NUMERIC(14,2) DEFAULT 0,
  -- FOREIGN
  stocks_foreign NUMERIC(14,2) DEFAULT 0,
  -- PHYSICAL
  gold_value NUMERIC(14,2) DEFAULT 0,
  property_value NUMERIC(14,2) DEFAULT 0,
  vehicle_value NUMERIC(14,2) DEFAULT 0,
  -- OTHER
  crypto NUMERIC(14,2) DEFAULT 0,
  other_assets NUMERIC(14,2) DEFAULT 0,
  -- LIABILITIES
  home_loan NUMERIC(14,2) DEFAULT 0,
  vehicle_loan NUMERIC(14,2) DEFAULT 0,
  personal_loan NUMERIC(14,2) DEFAULT 0,
  credit_card NUMERIC(14,2) DEFAULT 0,
  other_liabilities NUMERIC(14,2) DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FIRE configuration (single row per user)
CREATE TABLE IF NOT EXISTS finance_fire_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  current_age INTEGER DEFAULT 30,
  target_monthly_income NUMERIC(12,2) DEFAULT 200000,
  current_corpus NUMERIC(14,2) DEFAULT 0,
  current_monthly_investment NUMERIC(12,2) DEFAULT 0,
  current_monthly_income NUMERIC(12,2) DEFAULT 0,
  expected_return_rate NUMERIC(5,2) DEFAULT 8.0,
  inflation_rate NUMERIC(5,2) DEFAULT 6.0,
  swr NUMERIC(5,2) DEFAULT 3.5,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_finance_networth_date ON finance_networth(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_finance_annual_budgets_year ON finance_annual_budgets(year);

-- RLS
ALTER TABLE finance_annual_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_networth ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_fire_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth only" ON finance_annual_budgets;
DROP POLICY IF EXISTS "auth only" ON finance_networth;
DROP POLICY IF EXISTS "auth only" ON finance_fire_config;

CREATE POLICY "auth only" ON finance_annual_budgets FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth only" ON finance_networth FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth only" ON finance_fire_config FOR ALL USING (auth.role() = 'authenticated');
