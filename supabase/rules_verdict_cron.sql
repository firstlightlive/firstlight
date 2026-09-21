-- ═══════════════════════════════════════════════════
-- FIRST LIGHT — Daily Rules Verdict cron
-- RULE 01 SCREENS · RULE 02 FOOD CODE
-- Run in: Supabase Dashboard → SQL Editor (project edgnudrbysybefbqyijq)
--
-- 23:59 IST → 18:29 UTC daily → action=rules-verdict
-- Reads RULES_CHECKIN_<today> from the config table. Any rule NOT marked
-- clean = violated → RULE_BROKEN slides are posted to Instagram (one
-- carousel when both fell) + the operator gets an email.
-- Idempotent: a RULES_POST_<date> row is written after publishing, so a
-- re-run posts nothing twice.
--
-- The check-in page itself: https://firstlight.live/rules.html
-- ═══════════════════════════════════════════════════

-- Ensure pg_net is enabled (for HTTP calls from cron)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Helper exists from fix_cron_jobs.sql — recreate idempotently to be safe.
-- It reads admin_api_key + anon_key from the secrets table at call time,
-- so cron command text contains no secrets.
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

-- Clean slate (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rules-verdict') THEN
    PERFORM cron.unschedule('rules-verdict');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rules-reminder') THEN
    PERFORM cron.unschedule('rules-reminder');
  END IF;
END $$;

-- The reminder — 21:30 IST = 16:00 UTC, every day.
-- Emails the operator if the day's rules are not fully marked yet
-- (idempotent per day via RULES_REMIND_<date>).
SELECT cron.schedule('rules-reminder', '0 16 * * *', $$SELECT public.firstlight_cron_call('rules-reminder')$$);

-- The verdict — 23:59 IST = 18:29 UTC, every day
SELECT cron.schedule('rules-verdict', '29 18 * * *', $$SELECT public.firstlight_cron_call('rules-verdict')$$);

-- ── VERIFY ──
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'rules-%' ORDER BY jobname;
