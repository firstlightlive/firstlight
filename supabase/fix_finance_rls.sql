-- ═══════════════════════════════════════════════════════════════════
-- FIRSTLIGHT — FIX FINANCE TABLE RLS POLICIES
--
-- All finance tables were created with "auth only" policies that
-- block anon writes. This script opens them to anon + authenticated.
-- Safe to re-run — uses DROP IF EXISTS.
--
-- RUN IN: Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'expense_log',
    'income_log',
    'investment_log',
    'finance_budgets',
    'finance_recurring',
    'finance_annual_budgets',
    'finance_networth',
    'finance_fire_config'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      -- Drop old restrictive policy
      EXECUTE format('DROP POLICY IF EXISTS "auth only" ON public.%I', tbl);
      -- Drop any existing open_access policy (idempotent)
      EXECUTE format('DROP POLICY IF EXISTS open_access ON public.%I', tbl);
      -- Enable RLS (idempotent)
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      -- Create open policy for anon + authenticated
      EXECUTE format('CREATE POLICY open_access ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', tbl);
    END IF;
  END LOOP;
END $$;

-- Verify
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'expense_log','income_log','investment_log','finance_budgets',
    'finance_recurring','finance_annual_budgets','finance_networth','finance_fire_config'
  )
ORDER BY tablename;
