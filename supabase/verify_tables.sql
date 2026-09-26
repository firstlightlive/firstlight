-- ═══════════════════════════════════════════════════════════════
-- TABLE READINESS — READ ONLY. Changes nothing. Safe to re-run.
--
-- Checks every one of the 66 tables this codebase actually reads or writes
-- (extracted from app.js SB_* lists, admin-sync.js, every rest/v1/ path in
-- website/, and every from()/supaUpsert() in the edge function).
--
-- Only 20 of them have a CREATE statement in supabase/*.sql; the rest were made
-- ad-hoc in the dashboard over time, so the repo cannot tell you whether they
-- exist. This can.
--
-- READ THE OUTPUT TOP-DOWN: anything MISSING sorts first, and a MISSING row
-- marked GO-LIVE is a real blocker for the 27 Sep start. A MISSING 'feature'
-- row only breaks that one admin panel.
--
-- Paste into: Supabase Dashboard → SQL Editor (project edgnudrbysybefbqyijq)
-- ═══════════════════════════════════════════════════════════════

WITH expected(t, kind, visibility) AS (VALUES
    ('architecture_log','feature','private'),
    ('auth_audit_log','feature','public-ok'),
    ('body_weight','feature','private'),
    ('brahma_daily','feature','private'),
    ('brahma_log','feature','private'),
    ('brahma_monthly','feature','private'),
    ('brahma_weekly','feature','private'),
    ('comment_reactions','feature','public-ok'),
    ('comments','feature','public-ok'),
    ('config','GO-LIVE','public-ok'),
    ('daily_checkin','GO-LIVE','private'),
    ('daily_logs','GO-LIVE','private'),
    ('daily_rituals','GO-LIVE','private'),
    ('discipline_log','GO-LIVE','private'),
    ('deep_work_sessions','feature','private'),
    ('deepwork_log','feature','private'),
    ('ekadashi_log','feature','private'),
    ('engagement_counters','feature','public-ok'),
    ('expense_log','feature','private'),
    ('finance_annual_budgets','feature','private'),
    ('finance_budgets','feature','private'),
    ('finance_fire_config','feature','private'),
    ('finance_networth','feature','private'),
    ('finance_recurring','feature','private'),
    ('food_log','GO-LIVE','private'),
    ('goal_comments','feature','private'),
    ('goals','feature','private'),
    ('gym_prs','feature','private'),
    ('gym_workouts','feature','private'),
    ('health_daily','GO-LIVE','private'),
    ('health_metrics','feature','private'),
    ('income_log','feature','private'),
    ('instagram_posts','GO-LIVE','public-ok'),
    ('investment_log','feature','private'),
    ('journal_entries','feature','private'),
    ('journal_insights','feature','private'),
    ('journal_notes','feature','private'),
    ('mastery_daily','feature','private'),
    ('mastery_ideas','feature','private'),
    ('mastery_log','feature','private'),
    ('mastery_monthly_scores','feature','private'),
    ('mastery_weekly','feature','private'),
    ('media','GO-LIVE','private'),
    ('monthly_grids','feature','private'),
    ('proof_archive','GO-LIVE','public-ok'),
    ('races','feature','private'),
    ('reading_log','feature','private'),
    ('receipts','feature','private'),
    ('reset_days','feature','private'),
    ('reset_relapses','feature','private'),
    ('reset_state','feature','private'),
    ('rituals_log','GO-LIVE','private'),
    ('secrets','GO-LIVE','private'),
    ('site_config','feature','public-ok'),
    ('site_stats','feature','public-ok'),
    ('site_visits','feature','public-ok'),
    ('sleep_log','GO-LIVE','private'),
    ('slips','GO-LIVE','public-ok'),
    ('stories_completions','feature','private'),
    ('strava_activities','GO-LIVE','public-ok'),
    ('tomorrow_plan','feature','private'),
    ('visitor_identities','feature','public-ok'),
    ('voice_entries','feature','private'),
    ('weekend_log','GO-LIVE','private'),
    ('weekly_metrics','feature','private'),
    ('weekly_schedule','feature','private')
),
present AS (
  SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
),
rls AS (
  SELECT c.relname, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
),
anon_readable AS (
  SELECT DISTINCT tablename FROM pg_policies
   WHERE schemaname = 'public' AND 'anon' = ANY(roles)
)
SELECT
  e.kind                                                      AS tier,
  e.t                                                         AS table_name,
  CASE WHEN p.table_name IS NULL THEN '*** MISSING ***'
       ELSE 'present' END                                     AS exists_,
  CASE WHEN p.table_name IS NULL THEN ''
       WHEN r.relrowsecurity THEN 'RLS on'
       ELSE '!! RLS OFF' END                                  AS rls,
  CASE
    WHEN p.table_name IS NULL THEN ''
    WHEN a.tablename IS NOT NULL AND e.visibility = 'private'
      THEN '!! ANON CAN READ A PRIVATE TABLE'
    WHEN a.tablename IS NOT NULL THEN 'anon read (by design)'
    ELSE 'owner only' END                                     AS access
FROM expected e
LEFT JOIN present       p ON p.table_name = e.t
LEFT JOIN rls           r ON r.relname    = e.t
LEFT JOIN anon_readable a ON a.tablename  = e.t
ORDER BY (p.table_name IS NULL) DESC,          -- missing first
         (e.kind = 'GO-LIVE') DESC,            -- then the blockers
         e.t;

-- ── SUMMARY: one line, read this first ──
WITH expected(t, kind) AS (VALUES

    ('architecture_log','feature'),
    ('auth_audit_log','feature'),
    ('body_weight','feature'),
    ('brahma_daily','feature'),
    ('brahma_log','feature'),
    ('brahma_monthly','feature'),
    ('brahma_weekly','feature'),
    ('comment_reactions','feature'),
    ('comments','feature'),
    ('config','GO-LIVE'),
    ('daily_checkin','GO-LIVE'),
    ('daily_logs','GO-LIVE'),
    ('daily_rituals','GO-LIVE'),
    ('discipline_log','GO-LIVE'),
    ('deep_work_sessions','feature'),
    ('deepwork_log','feature'),
    ('ekadashi_log','feature'),
    ('engagement_counters','feature'),
    ('expense_log','feature'),
    ('finance_annual_budgets','feature'),
    ('finance_budgets','feature'),
    ('finance_fire_config','feature'),
    ('finance_networth','feature'),
    ('finance_recurring','feature'),
    ('food_log','GO-LIVE'),
    ('goal_comments','feature'),
    ('goals','feature'),
    ('gym_prs','feature'),
    ('gym_workouts','feature'),
    ('health_daily','GO-LIVE'),
    ('health_metrics','feature'),
    ('income_log','feature'),
    ('instagram_posts','GO-LIVE'),
    ('investment_log','feature'),
    ('journal_entries','feature'),
    ('journal_insights','feature'),
    ('journal_notes','feature'),
    ('mastery_daily','feature'),
    ('mastery_ideas','feature'),
    ('mastery_log','feature'),
    ('mastery_monthly_scores','feature'),
    ('mastery_weekly','feature'),
    ('media','GO-LIVE'),
    ('monthly_grids','feature'),
    ('proof_archive','GO-LIVE'),
    ('races','feature'),
    ('reading_log','feature'),
    ('receipts','feature'),
    ('reset_days','feature'),
    ('reset_relapses','feature'),
    ('reset_state','feature'),
    ('rituals_log','GO-LIVE'),
    ('secrets','GO-LIVE'),
    ('site_config','feature'),
    ('site_stats','feature'),
    ('site_visits','feature'),
    ('sleep_log','GO-LIVE'),
    ('slips','GO-LIVE'),
    ('stories_completions','feature'),
    ('strava_activities','GO-LIVE'),
    ('tomorrow_plan','feature'),
    ('visitor_identities','feature'),
    ('voice_entries','feature'),
    ('weekend_log','GO-LIVE'),
    ('weekly_metrics','feature'),
    ('weekly_schedule','feature')
),
present AS (SELECT table_name FROM information_schema.tables
             WHERE table_schema='public' AND table_type='BASE TABLE')
SELECT
  count(*)                                                        AS expected_tables,
  count(p.table_name)                                             AS present,
  count(*) - count(p.table_name)                                  AS missing,
  count(*) FILTER (WHERE e.kind='GO-LIVE' AND p.table_name IS NULL) AS golive_blockers,
  CASE WHEN count(*) FILTER (WHERE e.kind='GO-LIVE' AND p.table_name IS NULL) = 0
       THEN 'READY — every go-live table exists'
       ELSE 'NOT READY — a go-live table is missing (see the list above)' END AS verdict
FROM expected e LEFT JOIN present p ON p.table_name = e.t;

-- ── FRESHNESS of the tables tomorrow depends on ──
-- A table can exist and still be dead. These are the channels that feed Day 1.
-- NOTE: if this statement errors with "relation ... does not exist", that IS the
-- answer — the named table is missing. The presence list above already ran, so
-- you keep those results either way.
SELECT 'strava_activities' AS source, count(*)::text AS rows_,
       COALESCE(max(start_date_local)::text,'—') AS newest FROM strava_activities
UNION ALL SELECT 'health_daily',  count(*)::text, COALESCE(max(date)::text,'—')      FROM health_daily
UNION ALL SELECT 'proof_archive', count(*)::text, COALESCE(max(date)::text,'—')      FROM proof_archive
UNION ALL SELECT 'rituals_log',   count(*)::text, COALESCE(max(date)::text,'—')      FROM rituals_log
UNION ALL SELECT 'sleep_log',     count(*)::text, COALESCE(max(date)::text,'—')      FROM sleep_log
UNION ALL SELECT 'slips',         count(*)::text, COALESCE(max(date)::text,'—')      FROM slips
UNION ALL SELECT 'instagram_posts', count(*)::text, COALESCE(max(created_at)::text,'—') FROM instagram_posts
ORDER BY source;

-- ── The cron jobs that must fire from 27 Sep ──
SELECT jobname, schedule, CASE WHEN active THEN 'active' ELSE '!! INACTIVE' END AS state
  FROM cron.job ORDER BY jobname;
