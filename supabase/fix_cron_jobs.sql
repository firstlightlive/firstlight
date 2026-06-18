-- ═══════════════════════════════════════════════════════
-- FIRST LIGHT — Cron Jobs (Sync)
-- Run in: Supabase Dashboard → SQL Editor (project edgnudrbysybefbqyijq)
--
-- Refactored 2026-06-18: keys no longer hardcoded.
-- Helper function reads admin_api_key + anon_key from the `secrets`
-- table at call time, so cron job command text contains no secrets.
-- Rotate by UPDATEing public.secrets; nothing else needs to change.
--
-- Schedules (IST → UTC):
--   Early sync chain   05:30, 05:45, 05:55, 05:59 IST → 00:00, 00:15, 00:25, 00:29 UTC
--   Deadline window    06:00, 06:01, 06:15 IST       → 00:30, 00:31, 00:45 UTC
--   Mid-morning        07:30, 09:00 IST              → 02:00, 03:30 UTC
--   Late refresh       19:00 IST                     → 13:30 UTC
--   Pre-archive sync   02:00 IST                     → 20:30 UTC (previous day)
-- ═══════════════════════════════════════════════════════

-- Ensure pg_net is enabled (for HTTP calls from cron)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─────────────────────────────────────────────────────────────
-- HELPER: reads keys from secrets at execution time
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- Clean slate: remove all prior sync jobs (idempotent)
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT jobname FROM cron.job WHERE jobname LIKE 'sync-%' LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- Recreate 11 sync jobs (all call action=sync)
-- ─────────────────────────────────────────────────────────────
SELECT cron.schedule('sync-0200', '30 20 * * *', $$SELECT public.firstlight_cron_call('sync')$$);
SELECT cron.schedule('sync-0530', '0  0  * * *', $$SELECT public.firstlight_cron_call('sync')$$);
SELECT cron.schedule('sync-0545', '15 0  * * *', $$SELECT public.firstlight_cron_call('sync')$$);
SELECT cron.schedule('sync-0555', '25 0  * * *', $$SELECT public.firstlight_cron_call('sync')$$);
SELECT cron.schedule('sync-0559', '29 0  * * *', $$SELECT public.firstlight_cron_call('sync')$$);
SELECT cron.schedule('sync-0600', '30 0  * * *', $$SELECT public.firstlight_cron_call('sync')$$);
SELECT cron.schedule('sync-0601', '31 0  * * *', $$SELECT public.firstlight_cron_call('sync')$$);
SELECT cron.schedule('sync-0615', '45 0  * * *', $$SELECT public.firstlight_cron_call('sync')$$);
SELECT cron.schedule('sync-0730', '0  2  * * *', $$SELECT public.firstlight_cron_call('sync')$$);
SELECT cron.schedule('sync-0900', '30 3  * * *', $$SELECT public.firstlight_cron_call('sync')$$);
SELECT cron.schedule('sync-1900', '30 13 * * *', $$SELECT public.firstlight_cron_call('sync')$$);

-- ── VERIFY ──
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'sync-%' ORDER BY jobname;
