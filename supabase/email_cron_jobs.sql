-- ═══════════════════════════════════════════════════════
-- FIRST LIGHT — Email Cron Jobs (4 daily + 1 weekly)
-- Run in: Supabase Dashboard → SQL Editor (project edgnudrbysybefbqyijq)
--
-- Refactored 2026-06-18: keys no longer hardcoded.
-- Uses public.firstlight_cron_call(action) which reads keys from
-- the `secrets` table. To rotate keys, UPDATE public.secrets;
-- nothing else needs to change. See supabase/fix_cron_jobs.sql for the
-- helper definition (same helper is shared by sync + email jobs).
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

-- The helper is defined in supabase/fix_cron_jobs.sql.
-- This file assumes it already exists; recreate idempotently to be safe:
CREATE OR REPLACE FUNCTION public.firstlight_cron_call(action_name TEXT)
RETURNS VOID AS $body$
DECLARE
  v_admin_key TEXT;
  v_anon_key TEXT;
BEGIN
  SELECT value INTO v_admin_key FROM public.secrets WHERE key = 'admin_api_key';
  SELECT value INTO v_anon_key  FROM public.secrets WHERE key = 'anon_key';

  PERFORM net.http_get(
    url := 'https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync?action=' || action_name,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_anon_key,
      'X-Admin-Key',   v_admin_key
    )
  );
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clean slate: remove all prior email jobs (idempotent)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT jobname FROM cron.job WHERE jobname LIKE 'email-%' LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- Recreate the 4 email jobs
-- ─────────────────────────────────────────────────────────────
SELECT cron.schedule('email-morning', '0  23 * * *', $$SELECT public.firstlight_cron_call('email-morning')$$);
SELECT cron.schedule('email-streak',  '0  1  * * *', $$SELECT public.firstlight_cron_call('email-streak')$$);
SELECT cron.schedule('email-eod',     '30 16 * * *', $$SELECT public.firstlight_cron_call('email-eod')$$);
SELECT cron.schedule('email-weekly',  '30 1  * * 0', $$SELECT public.firstlight_cron_call('email-weekly')$$);

-- ── VERIFY ──
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'email-%' ORDER BY jobname;
