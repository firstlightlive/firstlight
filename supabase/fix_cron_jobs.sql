-- ═══════════════════════════════════════════════════════
-- FIRST LIGHT — Fix Cron Jobs
-- Run in: Supabase Dashboard → SQL Editor
--
-- Step 1: Run the DIAGNOSTIC queries first (at bottom)
-- Step 2: If jobs are failing, run the FIX section
-- ═══════════════════════════════════════════════════════

-- ══════════════════════════════════
-- DIAGNOSTIC: Check existing jobs
-- ══════════════════════════════════

-- 1. List all cron jobs
SELECT jobid, jobname, schedule, command FROM cron.job ORDER BY jobid;

-- 2. Check execution history (last 20)
SELECT jobid, job_name, status, return_message, start_time, end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;

-- ══════════════════════════════════
-- FIX: Delete old jobs and recreate
-- Run this ONLY if diagnostic shows failures
-- ══════════════════════════════════

-- First, delete ALL existing sync jobs
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'sync-%';

-- Verify pg_net is enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Recreate all 6 jobs with correct syntax
-- 5:55 AM IST = 00:25 UTC
SELECT cron.schedule(
  'sync-0555',
  '25 0 * * *',
  $$
  SELECT net.http_get(
    url := 'https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync?action=sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ251ZHJieXN5YmVmYnF5aWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTExNjEsImV4cCI6MjA5MTgyNzE2MX0.UOTH1J-022hwSQZ2QkpiRxw3wtctaVsJQEBoLYYMkHk',
      'X-Admin-Key', 'b8464678b573c885c449958a9ea760c08b01279d01d3a1f996fc92b7364f10b7'
    )
  );
  $$
);

-- 5:59 AM IST = 00:29 UTC
SELECT cron.schedule(
  'sync-0559',
  '29 0 * * *',
  $$
  SELECT net.http_get(
    url := 'https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync?action=sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ251ZHJieXN5YmVmYnF5aWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTExNjEsImV4cCI6MjA5MTgyNzE2MX0.UOTH1J-022hwSQZ2QkpiRxw3wtctaVsJQEBoLYYMkHk',
      'X-Admin-Key', 'b8464678b573c885c449958a9ea760c08b01279d01d3a1f996fc92b7364f10b7'
    )
  );
  $$
);

-- 6:15 AM IST = 00:45 UTC
SELECT cron.schedule(
  'sync-0615',
  '45 0 * * *',
  $$
  SELECT net.http_get(
    url := 'https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync?action=sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ251ZHJieXN5YmVmYnF5aWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTExNjEsImV4cCI6MjA5MTgyNzE2MX0.UOTH1J-022hwSQZ2QkpiRxw3wtctaVsJQEBoLYYMkHk',
      'X-Admin-Key', 'b8464678b573c885c449958a9ea760c08b01279d01d3a1f996fc92b7364f10b7'
    )
  );
  $$
);

-- 9:00 AM IST = 03:30 UTC
SELECT cron.schedule(
  'sync-0900',
  '30 3 * * *',
  $$
  SELECT net.http_get(
    url := 'https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync?action=sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ251ZHJieXN5YmVmYnF5aWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTExNjEsImV4cCI6MjA5MTgyNzE2MX0.UOTH1J-022hwSQZ2QkpiRxw3wtctaVsJQEBoLYYMkHk',
      'X-Admin-Key', 'b8464678b573c885c449958a9ea760c08b01279d01d3a1f996fc92b7364f10b7'
    )
  );
  $$
);

-- 7:00 PM IST = 13:30 UTC
SELECT cron.schedule(
  'sync-1900',
  '30 13 * * *',
  $$
  SELECT net.http_get(
    url := 'https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync?action=sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ251ZHJieXN5YmVmYnF5aWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTExNjEsImV4cCI6MjA5MTgyNzE2MX0.UOTH1J-022hwSQZ2QkpiRxw3wtctaVsJQEBoLYYMkHk',
      'X-Admin-Key', 'b8464678b573c885c449958a9ea760c08b01279d01d3a1f996fc92b7364f10b7'
    )
  );
  $$
);

-- 2:00 AM IST = 20:30 UTC
SELECT cron.schedule(
  'sync-0200',
  '30 20 * * *',
  $$
  SELECT net.http_get(
    url := 'https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync?action=sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ251ZHJieXN5YmVmYnF5aWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTExNjEsImV4cCI6MjA5MTgyNzE2MX0.UOTH1J-022hwSQZ2QkpiRxw3wtctaVsJQEBoLYYMkHk',
      'X-Admin-Key', 'b8464678b573c885c449958a9ea760c08b01279d01d3a1f996fc92b7364f10b7'
    )
  );
  $$
);

-- Verify new jobs
SELECT jobid, jobname, schedule FROM cron.job ORDER BY jobid;
