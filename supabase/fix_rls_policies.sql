-- ═══════════════════════════════════════════════════════════════════
-- FIRSTLIGHT — FIX RLS POLICIES (v2)
--
-- Drops ALL existing restrictive policies ("Auth only", etc.)
-- then creates open read/write policies for anon role.
-- Safe to re-run — uses DROP IF EXISTS + conditional CREATE.
--
-- RUN THIS IN: Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- ═══════════════════════════════════════════════════════════════════

-- Step 1: Drop ALL existing policies on every app table.
-- This removes the "Auth only" and any other blocking policies.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'rituals_log','daily_rituals','journal_entries','daily_checkin',
        'mastery_log','mastery_daily','mastery_weekly','mastery_ideas','mastery_monthly_scores',
        'brahma_log','brahma_daily','brahma_weekly',
        'races','gym_workouts','gym_prs','deepwork_log','reading_log',
        'ekadashi_log','weekly_schedule','slips','config','daily_logs',
        'stories_completions','engagement_counters','architecture_log','voice_entries',
        'proof_archive','instagram_posts','strava_activities','comments','comment_reactions'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Step 2: Create open policies — allow anon to read + write everything.
-- Single-user app, admin key protects the API layer.

-- Helper function to avoid repeating ourselves
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'rituals_log','daily_rituals','journal_entries','daily_checkin',
    'mastery_log','mastery_daily','mastery_weekly','mastery_ideas','mastery_monthly_scores',
    'brahma_log','brahma_daily','brahma_weekly',
    'races','gym_workouts','gym_prs','deepwork_log','reading_log',
    'ekadashi_log','weekly_schedule','slips','config','daily_logs',
    'stories_completions','engagement_counters','architecture_log','voice_entries',
    'proof_archive','instagram_posts','strava_activities','comments','comment_reactions'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Check table exists before creating policy
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      -- Enable RLS (idempotent)
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      -- Create open policy
      EXECUTE format('CREATE POLICY open_access ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', tbl);
    END IF;
  END LOOP;
END $$;

-- Step 3: Verify
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;