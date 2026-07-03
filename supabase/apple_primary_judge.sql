-- ═══════════════════════════════════════════════════════════════════════════
-- FIRST LIGHT — Apple-primary judge (2026-07-03)
-- Post-Strava-ban pivot: the accountability engine judges from Apple Health
-- (health_daily, fed by Health Auto Export) as the PRIMARY source; Strava is
-- best-effort garnish. See judgeToday()/_pullAppleForDate() in
-- supabase/functions/firstlight-sync/index.ts.
--
-- One additive column: per-workout detail (type, duration_min, calories,
-- distance_km, start) so typed distance floors (cycle ≥10km etc.) can apply.
-- Rows ingested before this column exist judge via the 30-min session floor.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE health_daily ADD COLUMN IF NOT EXISTS workouts_detail JSONB;

-- ── VERIFY ──
SELECT column_name FROM information_schema.columns
WHERE table_name = 'health_daily' AND column_name = 'workouts_detail';
