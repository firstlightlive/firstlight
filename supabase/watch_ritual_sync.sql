-- ═══════════════════════════════════════════════════════════════════════════
-- FIRST LIGHT — watchOS ritual-sync setup
-- Run once in: Supabase Dashboard → SQL Editor (project edgnudrbysybefbqyijq)
--
-- Creates:
--   1. secrets.watch_api_key — the narrow key the watch app authenticates with
--      (x-watch-key header on action=ritual-sync). Generate the value with:
--        openssl rand -hex 16          → 32 lowercase hex chars
--      Rotation = re-run this INSERT with a new value + re-enter on the watch.
--      No edge-function redeploy needed (getSecret reads per-request).
--   2. weekend_log — Sat/Sun task completions (rituals_log's CHECK constraint
--      only allows morning|midday|evening, so weekend gets its own table).
--      Service-role only; history-locked like the other daily tables.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Watch API key  ── REPLACE <32-hex> BEFORE RUNNING ──
INSERT INTO secrets (key, value, updated_at)
VALUES ('watch_api_key', '<32-hex>', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- 2. Weekend log
CREATE TABLE IF NOT EXISTS weekend_log (
  date DATE PRIMARY KEY,
  completed_ids JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE weekend_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON weekend_log FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_weekend_log_updated ON weekend_log;
CREATE TRIGGER trg_weekend_log_updated BEFORE UPDATE ON weekend_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS history_lock ON weekend_log;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON weekend_log
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('date');

-- ── VERIFY ──
SELECT key, length(value) AS len FROM secrets WHERE key = 'watch_api_key';
SELECT table_name FROM information_schema.tables WHERE table_name = 'weekend_log';
