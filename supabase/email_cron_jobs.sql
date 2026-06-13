-- ═══════════════════════════════════════════════════════
-- FIRST LIGHT — Email Cron Jobs (4 daily + 1 weekly)
-- Run in: Supabase Dashboard → SQL Editor (project edgnudrbysybefbqyijq)
--
-- Schedules (IST → UTC):
--   Morning reminder  04:30 IST  →  23:00 UTC (previous day)
--   Streak update     06:30 IST  →  01:00 UTC
--   End-of-day        22:00 IST  →  16:30 UTC
--   Weekly recap   Sun 07:00 IST →  Sun 01:30 UTC
--
-- Publish confirmation = triggered from the app post-publish; no cron needed.
-- ═══════════════════════════════════════════════════════

-- Ensure pg_net is enabled (for HTTP calls from cron)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Clean up any prior email jobs (idempotent)
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'email-%';

-- Admin key used to authorize the edge function (matches secrets table)
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_admin_key text := 'b8464678b573c885c449958a9ea760c08b01279d01d3a1f996fc92b7364f10b7';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ251ZHJieXN5YmVmYnF5aWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTExNjEsImV4cCI6MjA5MTgyNzE2MX0.UOTH1J-022hwSQZ2QkpiRxw3wtctaVsJQEBoLYYMkHk';
  v_base text := 'https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync';
BEGIN
  -- 1. MORNING REMINDER · 04:30 IST · daily
  PERFORM cron.schedule(
    'email-morning',
    '0 23 * * *',
    format($f$SELECT net.http_get(
      url := '%s?action=email-morning&admin_key=%s',
      headers := jsonb_build_object('Authorization', 'Bearer %s')
    );$f$, v_base, v_admin_key, v_anon_key)
  );

  -- 2. STREAK UPDATE · 06:30 IST · daily
  PERFORM cron.schedule(
    'email-streak',
    '0 1 * * *',
    format($f$SELECT net.http_get(
      url := '%s?action=email-streak&admin_key=%s',
      headers := jsonb_build_object('Authorization', 'Bearer %s')
    );$f$, v_base, v_admin_key, v_anon_key)
  );

  -- 3. END-OF-DAY REPORT · 22:00 IST · daily
  PERFORM cron.schedule(
    'email-eod',
    '30 16 * * *',
    format($f$SELECT net.http_get(
      url := '%s?action=email-eod&admin_key=%s',
      headers := jsonb_build_object('Authorization', 'Bearer %s')
    );$f$, v_base, v_admin_key, v_anon_key)
  );

  -- 4. WEEKLY RECAP · Sunday 07:00 IST
  PERFORM cron.schedule(
    'email-weekly',
    '30 1 * * 0',
    format($f$SELECT net.http_get(
      url := '%s?action=email-weekly&admin_key=%s',
      headers := jsonb_build_object('Authorization', 'Bearer %s')
    );$f$, v_base, v_admin_key, v_anon_key)
  );
END $$;

-- ── VERIFY ──
SELECT jobid, jobname, schedule
FROM cron.job
WHERE jobname LIKE 'email-%'
ORDER BY jobname;
