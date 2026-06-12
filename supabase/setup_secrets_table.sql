-- ═══════════════════════════════════════════════════════
-- FIRST LIGHT — Secrets table for token storage
-- Replaces Google Secret Manager
-- Run in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;

-- ONLY service_role can access — never exposed to anon/public
DROP POLICY IF EXISTS "service_role_only" ON secrets;
CREATE POLICY "service_role_only" ON secrets
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Trigger to auto-update timestamp
CREATE TRIGGER tr_secrets_updated BEFORE UPDATE ON secrets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════
-- IMPORTANT: After running this SQL, insert your tokens:
--
-- INSERT INTO secrets (key, value) VALUES
--   ('strava_refresh', '<your-strava-refresh-token>'),
--   ('strava_access', '<your-strava-access-token>'),
--   ('strava_client_id', '<your-strava-client-id>'),
--   ('strava_client_secret', '<your-strava-client-secret>'),
--   ('ig_access', '<your-ig-long-lived-token>'),
--   ('ig_app_id', '<your-ig-app-id>'),
--   ('ig_app_secret', '<your-ig-app-secret>'),
--   ('admin_api_key', '<your-admin-api-key>'),
--   ('health_webhook_secret', '<your-health-webhook-secret>')
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
-- ═══════════════════════════════════════════════════════
