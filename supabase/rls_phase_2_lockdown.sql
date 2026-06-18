-- ═══════════════════════════════════════════════════════════════════
-- FIRST LIGHT — RLS Lockdown Phase 2 (2026-06-18)
-- Run in: Supabase Dashboard → SQL Editor (project edgnudrbysybefbqyijq)
--
-- Captures two sets of changes applied to production today:
--
--   A. OPTION A — re-grant anon INSERT/UPDATE on the 4 daily-punch tables
--      so the PWA's FL.upsert() writes work without going through the
--      Edge Function. SELECT remains locked (Jun-16 lockdown).
--      Temporary fix; Option B (Edge Function write proxy) is the
--      durable replacement.
--
--   B. PHASE 2 LOCKDOWN — close the gaps the Jun-16 sweep missed.
--      Found during a full audit: 6 finance tables + claims + reading_log
--      + tomorrow_plan + visitor_logs were anon-readable, and claims +
--      visitor_logs had DELETE/TRUNCATE/TRIGGER/REFERENCES for anon.
--      Personal salary/rent/expense rows were publicly fetchable.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- A. OPTION A — re-grant anon writes on the 4 punch tables
-- ─────────────────────────────────────────────────────────────
-- Reads stay locked (anon SELECT still 401). Writes work.
-- Acceptable for a single-user app per [reference_github_accounts]
-- thinking; replace with Edge-function proxy when implementing Option B.

GRANT INSERT, UPDATE ON public.daily_checkin,
                       public.sleep_log,
                       public.brahma_log,
                       public.mastery_log
  TO anon;

-- ─────────────────────────────────────────────────────────────
-- B.1 — Close finance + private SELECT leaks
-- ─────────────────────────────────────────────────────────────
-- These were anon-readable until 2026-06-18 audit.
-- Personal finance + reading habits + tomorrow's plans should never be public.

REVOKE SELECT ON public.expense_log,
                  public.income_log,
                  public.investment_log,
                  public.finance_budgets,
                  public.finance_recurring,
                  public.finance_networth,
                  public.claims,
                  public.reading_log,
                  public.tomorrow_plan,
                  public.visitor_logs
  FROM anon;

-- ─────────────────────────────────────────────────────────────
-- B.2 — Revoke catastrophic perms on the two over-granted tables
-- ─────────────────────────────────────────────────────────────
-- claims and visitor_logs had DELETE/TRUNCATE/TRIGGER/REFERENCES
-- for anon. The Jun-16 lockdown said "Catastrophic ops revoked
-- from anon on ALL tables" but these two slipped through.
-- Also revoke INSERT/UPDATE — they're not user-facing endpoints.

REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES, INSERT, UPDATE
  ON public.claims, public.visitor_logs
  FROM anon;

-- ─────────────────────────────────────────────────────────────
-- VERIFY (run after applying)
-- ─────────────────────────────────────────────────────────────

-- 1. Anon should have zero SELECT on private finance/reading/plan/visitor_logs tables:
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
  AND table_name IN (
    'expense_log','income_log','investment_log',
    'finance_budgets','finance_recurring','finance_networth',
    'claims','reading_log','tomorrow_plan','visitor_logs'
  );
-- Expect: 0 rows

-- 2. Punch tables should show only INSERT + UPDATE:
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
  AND table_name IN ('daily_checkin','sleep_log','brahma_log','mastery_log')
ORDER BY table_name, privilege_type;
-- Expect: 8 rows (4 INSERT + 4 UPDATE)

-- 3. Zero anon DELETE/TRUNCATE/TRIGGER/REFERENCES across all public:
SELECT COUNT(*) AS catastrophic_perms_remaining
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
  AND privilege_type IN ('DELETE','TRUNCATE','TRIGGER','REFERENCES');
-- Expect: 0
