-- ═══════════════════════════════════════════════════════
-- Add calorie/kilojoules/device_name columns to strava_activities
-- Reason: Strava list endpoint omits these — only detail endpoint returns them.
--         Edge function now fetches detail per activity and writes here.
-- Applied: 2026-06-15 via Management API
-- ═══════════════════════════════════════════════════════

ALTER TABLE strava_activities ADD COLUMN IF NOT EXISTS kilojoules         NUMERIC;
ALTER TABLE strava_activities ADD COLUMN IF NOT EXISTS device_name        TEXT;
ALTER TABLE strava_activities ADD COLUMN IF NOT EXISTS calories_synced_at TIMESTAMPTZ;

-- calories_synced_at marks rows the backfill has already processed,
-- so the loop can resume safely after rate-limit pauses or restarts.
