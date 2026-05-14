-- ═══════════════════════════════════════════════════════════════════
-- FIRSTLIGHT — PERMANENT GRANT FIX
--
-- Purpose: Explicitly GRANT table access to anon, authenticated,
--          and service_role — future-proofing against Supabase's
--          October 30, 2026 enforcement of revoked public schema grants.
--
-- Run ONCE in: Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- Safe to re-run anytime — GRANT is idempotent (no error if already granted).
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  tbl TEXT;

  -- Public read-only tables (anon can SELECT, authenticated/service_role full access)
  public_readonly TEXT[] := ARRAY[
    'instagram_posts',
    'strava_activities',
    'proof_archive',
    'slips',
    'comments',
    'comment_reactions'
  ];

  -- Private tables (authenticated + service_role full access, anon NO access)
  private_tables TEXT[] := ARRAY[
    'rituals_log', 'daily_rituals',
    'journal_entries', 'journal_notes', 'journal_insights', 'daily_checkin',
    'mastery_log', 'mastery_daily', 'mastery_weekly', 'mastery_ideas', 'mastery_monthly_scores',
    'brahma_log', 'brahma_daily', 'brahma_weekly', 'brahma_monthly'
  ];

  -- App tables (anon full access — single-user app, admin key protects the API layer)
  app_tables TEXT[] := ARRAY[
    'races', 'gym_workouts', 'gym_prs', 'deepwork_log', 'reading_log',
    'ekadashi_log', 'weekly_schedule', 'tomorrow_plan', 'config', 'daily_logs',
    'sleep_log', 'stories_completions', 'engagement_counters', 'architecture_log', 'voice_entries',
    'body_weight', 'weekly_metrics', 'monthly_grids', 'goals', 'goal_comments', 'health_daily',
    'expense_log', 'income_log', 'investment_log', 'finance_budgets',
    'finance_recurring', 'finance_annual_budgets', 'finance_networth', 'finance_fire_config'
  ];

BEGIN
  -- ── Public read-only: anon SELECT, authenticated + service_role full ──
  FOREACH tbl IN ARRAY public_readonly LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('GRANT SELECT ON public.%I TO anon', tbl);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', tbl);
      RAISE NOTICE 'Granted (public readonly): %', tbl;
    ELSE
      RAISE NOTICE 'Skipped (table not found): %', tbl;
    END IF;
  END LOOP;

  -- ── Private: no anon access, authenticated + service_role full ──
  FOREACH tbl IN ARRAY private_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', tbl);
      RAISE NOTICE 'Granted (private): %', tbl;
    ELSE
      RAISE NOTICE 'Skipped (table not found): %', tbl;
    END IF;
  END LOOP;

  -- ── App tables: anon full access (single-user admin app) ──
  FOREACH tbl IN ARRAY app_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', tbl);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', tbl);
      RAISE NOTICE 'Granted (app): %', tbl;
    ELSE
      RAISE NOTICE 'Skipped (table not found): %', tbl;
    END IF;
  END LOOP;

END $$;

-- ── Also grant USAGE on the public schema itself ──
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- ── Verify: show all grants for FirstLight tables ──
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;
