-- ═══════════════════════════════════════════════════════════════════════════
-- FIRST LIGHT — Accountability Engine Cron Jobs (Phase 6)
-- Three pg_cron jobs that call the firstlight-sync Edge Function on schedule.
-- Run in: Supabase Dashboard → SQL Editor (project edgnudrbysybefbqyijq)
--
-- Schedules (IST → UTC):
--   21:00 IST  → 15:30 UTC daily   — engine-nudge            (alert if not qualified)
--   23:30 IST  → 18:00 UTC daily   — engine-verdict          (final judgement + publish)
--   23:55 IST  → 18:25 UTC daily   — engine-verdict-fallback (publish ONLY if 23:30 posted nothing — idempotent skip if already posted)
--   00:15 IST  → 18:45 UTC daily   — engine-grace            (recheck yesterday's MISS)
--
-- Assumes public.firstlight_cron_call(text) already exists (defined in
-- supabase/email_cron_jobs.sql). Reads admin_key + anon_key from secrets.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Helper exists already, but recreate idempotently in case this file is run standalone.
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

-- Clean slate: remove any prior engine jobs (idempotent)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT jobname FROM cron.job WHERE jobname LIKE 'engine-%' LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- Schedule the 3 engine jobs
-- ─────────────────────────────────────────────────────────────

-- 21:00 IST nudge — if no qualifying activity yet, email "2.5h left"
SELECT cron.schedule(
  'engine-nudge',
  '30 15 * * *',                                  -- 15:30 UTC = 21:00 IST
  $$SELECT public.firstlight_cron_call('engine-nudge')$$
);

-- 23:30 IST final verdict — judge + render + publish + ledger + email
SELECT cron.schedule(
  'engine-verdict',
  '0 18 * * *',                                   -- 18:00 UTC = 23:30 IST
  $$SELECT public.firstlight_cron_call('engine-verdict')$$
);

-- 23:55 IST fallback verdict — safety net. engine-verdict is idempotent
-- (_verdictAlreadyPosted), so this ONLY publishes if the 23:30 run posted nothing
-- (e.g. it errored, or Strava hadn't synced and it bailed). If 23:30 already posted,
-- this is a no-op skip. "If no posting is done, then post" — final time, do not change.
SELECT cron.schedule(
  'engine-verdict-fallback',
  '25 18 * * *',                                  -- 18:25 UTC = 23:55 IST
  $$SELECT public.firstlight_cron_call('engine-verdict')$$
);

-- 00:15 IST grace re-check — flip yesterday's MISS to WIN if late sync caught up
SELECT cron.schedule(
  'engine-grace',
  '45 18 * * *',                                  -- 18:45 UTC = 00:15 IST (next day)
  $$SELECT public.firstlight_cron_call('engine-grace')$$
);

-- ── VERIFY ──
SELECT jobname, schedule, command, active
FROM cron.job
WHERE jobname LIKE 'engine-%'
ORDER BY jobname;

-- ── TO DISABLE (manual override) ──
-- SELECT cron.unschedule('engine-nudge');
-- SELECT cron.unschedule('engine-verdict');
-- SELECT cron.unschedule('engine-grace');
