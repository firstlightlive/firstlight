-- ═══════════════════════════════════════════════════════════════════════════
-- FIRST LIGHT — Monthly Recap Cron Job (Phase 7)
-- Fires once per month on the 1st at 06:00 IST → aggregates the *previous*
-- month and publishes a 7-slide IG carousel + Story to @firstlightlive.
--
-- Why 1st at 06:00 IST?
--   - Previous-day verdict completes at 23:30 IST and grace at 00:15 IST.
--   - 06:00 IST gives a 5h45 safety margin for late Strava sync to settle.
--   - Before user wakes up → user sees the recap with morning coffee.
--   - 06:00 IST = 00:30 UTC → cron syntax: `30 0 1 * *`
--
-- Idempotent: runMonthlyRecap stamps secrets[monthly_recap_YYYY-MM] after
-- publish; re-runs are no-ops.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior monthly-recap jobs (idempotent)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT jobname FROM cron.job WHERE jobname IN ('engine-monthly-recap', 'monthly-recap') LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END $$;

-- Schedule: 1st of every month at 06:00 IST = 00:30 UTC
SELECT cron.schedule(
  'engine-monthly-recap',
  '30 0 1 * *',
  $$SELECT public.firstlight_cron_call('engine-monthly-recap')$$
);

-- ── VERIFY ──
SELECT jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'engine-monthly-recap';

-- ── TO DISABLE (manual override) ──
-- SELECT cron.unschedule('engine-monthly-recap');

-- ── MANUAL TRIGGER (for any past month) ──
-- For a specific month (returns JSON aggregate + post id):
--   curl -H "X-Admin-Key: $ADMIN_KEY" \
--     "https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync?action=monthly-recap&month=2026-06"
-- For dry-run (render only, no publish):
--   curl -H "X-Admin-Key: $ADMIN_KEY" \
--     "https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync?action=monthly-recap&dryRun=1"
