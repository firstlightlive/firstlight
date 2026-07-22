-- ═══════════════════════════════════════════════════════════════════════════
-- FIRST LIGHT — EXTEND GRACE SWEEPS (late-sync false-miss safety net)
-- ═══════════════════════════════════════════════════════════════════════════
-- Root cause B of the 2026-07-21 false miss: the qualifying activity synced
-- AFTER the 23:50 verdict AND the lone 00:15 grace re-check had both run, so
-- nothing re-judged the day and it stuck as a MISS. Apple Health / Health Auto
-- Export has no delivery-time guarantee (it can't even read while the phone is
-- locked), so a late-evening workout can land hours after the verdict.
--
-- This adds three more engine-grace sweeps — 01:00, 02:00, 02:50 IST — on top of
-- the existing 00:15 IST run, covering the window up to the ~03:00 IST history
-- lock. engine-grace is idempotent: it only acts while yesterday still reads
-- MISS, flips it to WIN the moment a source finally shows the activity, and
-- (with fix_grace_slip_retraction.sql applied) clears the phantom slip. Once it
-- flips, later sweeps see proof_archive=WIN and no-op — no repeat work/email.
--
-- IST = UTC + 5:30  →  01:00 IST = 19:30 UTC · 02:00 IST = 20:30 UTC · 02:50 IST = 21:20 UTC
--
-- Assumes public.firstlight_cron_call(text) already exists
-- (defined in accountability_engine_cron.sql).
-- Idempotent: unschedules these three job names first, then reschedules.
-- Run in: Supabase Dashboard → SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT jobname FROM cron.job
    WHERE jobname IN ('engine-grace-0100', 'engine-grace-0200', 'engine-grace-0250')
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END $$;

SELECT cron.schedule('engine-grace-0100', '30 19 * * *', $$SELECT public.firstlight_cron_call('engine-grace')$$);
SELECT cron.schedule('engine-grace-0200', '30 20 * * *', $$SELECT public.firstlight_cron_call('engine-grace')$$);
SELECT cron.schedule('engine-grace-0250', '20 21 * * *', $$SELECT public.firstlight_cron_call('engine-grace')$$);

-- ── VERIFY ──
-- SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'engine-grace%' ORDER BY schedule;
-- Expect 4 rows: 18:45 (00:15 IST), 19:30 (01:00), 20:30 (02:00), 21:20 (02:50).
