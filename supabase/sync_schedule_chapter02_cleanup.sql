-- ═══════════════════════════════════════════════════════════════════════════
-- FIRST LIGHT — Strava sync schedule rationalisation for Chapter 02
-- ═══════════════════════════════════════════════════════════════════════════
-- Chapter 02 REBUILD ran with rule "5km RUN before 6 AM IST". The morning
-- cluster of syncs (every 15s around the 6 AM deadline) was added so the
-- 06:30 IST email could report whether the rule was cleared. That rule is
-- retired — ENDURANCE has no time-of-day deadline (anything before 11:59 PM
-- IST counts). The morning cluster serves no purpose under Chapter 02.
--
-- This migration:
--   1. Drops 7 obsolete REBUILD-era morning syncs (05:30 → 06:15)
--   2. Adds 2 strategically-placed syncs for Chapter 02:
--      - sync-prenudge   (20:45 IST) — fresh DB before the 21:00 nudge
--      - sync-preverdict (23:15 IST) — fresh DB before the 23:30 verdict
--        (the WIN carousel's route slide reads polyline/elev/calories from
--        strava_activities, so freshness matters at verdict time)
--
-- Result: 11 syncs/day → 6 syncs/day, all of which now serve a Chapter 02
-- purpose. The verdict engine itself pulls live from the Strava API at
-- 23:30 IST and does not depend on these DB syncs.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the 7 morning-cluster syncs (REBUILD era)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT jobname FROM cron.job
           WHERE jobname IN ('sync-0530','sync-0545','sync-0555','sync-0559',
                             'sync-0600','sync-0601','sync-0615')
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END $$;

-- Drop any prior versions of the 2 new syncs (idempotent)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT jobname FROM cron.job
           WHERE jobname IN ('sync-prenudge', 'sync-preverdict')
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END $$;

-- 20:45 IST = 15:15 UTC — fresh data for the 21:00 IST nudge
SELECT cron.schedule(
  'sync-prenudge',
  '15 15 * * *',
  $$SELECT public.firstlight_cron_call('sync')$$
);

-- 23:15 IST = 17:45 UTC — fresh data for the 23:30 IST verdict + route slide
SELECT cron.schedule(
  'sync-preverdict',
  '45 17 * * *',
  $$SELECT public.firstlight_cron_call('sync')$$
);

-- ── VERIFY ──
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname LIKE 'sync-%'
ORDER BY schedule;
