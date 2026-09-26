-- ═══════════════════════════════════════════════════════════════
-- PRE-FLIGHT — READ ONLY. Changes nothing. Run this FIRST.
--
-- Tells you exactly which of the other scripts you still need, so you are
-- not re-running migrations blind. Paste the whole file into the Supabase
-- SQL editor (project edgnudrbysybefbqyijq) and read the `status` column.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── Does the lifetime food table exist yet?
SELECT 'food_log table' AS check,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                          WHERE table_schema='public' AND table_name='food_log')
            THEN 'EXISTS — food_log.sql already applied'
            ELSE 'MISSING → run supabase/food_log.sql' END AS status;

-- 2 ── Is it private (authenticated only, never anon)?
SELECT 'food_log RLS' AS check,
       COALESCE(
         (SELECT 'policy: ' || policyname || ' → ' || roles::text
            FROM pg_policies
           WHERE schemaname='public' AND tablename='food_log' LIMIT 1),
         'no policy yet (table missing or RLS not applied)') AS status;

-- 3 ── Is it streaming for cross-device sync?
SELECT 'food_log realtime' AS check,
       CASE WHEN EXISTS (SELECT 1 FROM pg_publication_tables
                          WHERE pubname='supabase_realtime'
                            AND schemaname='public' AND tablename='food_log')
            THEN 'IN PUBLICATION — cross-device sync will work'
            ELSE 'NOT PUBLISHED → run supabase/food_log.sql' END AS status;

-- 4 ── Are the rules crons scheduled? (21:30 IST nudge + 23:59 IST verdict)
SELECT 'cron: ' || jobname AS check,
       'schedule ' || schedule || ' · ' || CASE WHEN active THEN 'ACTIVE' ELSE 'INACTIVE' END AS status
  FROM cron.job
 WHERE jobname IN ('rules-reminder','rules-verdict')
 UNION ALL
SELECT 'cron: rules jobs' AS check,
       'MISSING → run supabase/rules_verdict_cron.sql' AS status
 WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='rules-verdict');

-- 5 ── All scheduled jobs, so nothing else has silently died.
SELECT 'all cron jobs' AS check,
       string_agg(jobname || CASE WHEN active THEN '' ELSE '(OFF)' END, ', ' ORDER BY jobname) AS status
  FROM cron.job;

-- 6 ── Is the phone still delivering? (newest Apple Health rows)
SELECT 'health_daily newest' AS check,
       COALESCE(MAX(date)::text, 'NO ROWS') ||
       CASE WHEN MAX(date) >= (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')::date - 1
            THEN ' — LIVE' ELSE ' — BEHIND, check Health Auto Export' END AS status
  FROM public.health_daily;

-- 7 ── Watch ritual sync freshness (this looked dead on 2026-09-26).
SELECT 'rituals_log newest' AS check,
       COALESCE(MAX(date)::text, 'NO ROWS') AS status
  FROM public.rituals_log;

-- 8 ── Is the watch key real, or still the '<32-hex>' placeholder from the
--      setup script? A placeholder 403s every watch call.
SELECT 'watch_api_key' AS check,
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM secrets WHERE key='watch_api_key')
           THEN 'ABSENT → run supabase/watch_ritual_sync.sql with a real key'
         WHEN (SELECT value FROM secrets WHERE key='watch_api_key') ~ '^<.*>$'
           THEN 'STILL THE <32-hex> PLACEHOLDER → every watch call 403s'
         WHEN length((SELECT value FROM secrets WHERE key='watch_api_key')) < 16
           THEN 'TOO SHORT → regenerate with: openssl rand -hex 16'
         ELSE 'configured (' || length((SELECT value FROM secrets WHERE key='watch_api_key')) || ' chars)'
       END AS status;

-- 9 ── Watch telemetry: has any watch call ever succeeded or failed?
SELECT 'WATCH_SYNC_HEALTH' AS check,
       COALESCE((SELECT value FROM secrets WHERE key='WATCH_SYNC_HEALTH'),
                'not present — no watch call has succeeded OR failed since the telemetry shipped') AS status;
