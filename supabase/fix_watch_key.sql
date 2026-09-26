-- ═══════════════════════════════════════════════════════════════
-- FIX THE WATCH KEY — it is currently the '<32-hex>' PLACEHOLDER
--
-- Confirmed live on 2026-09-26: `npm run check:phone` reports
--     watch_api_key → PLACEHOLDER/TOO SHORT
-- so watch_ritual_sync.sql was run WITHOUT substituting the placeholder. The
-- stored secret is literally the string '<32-hex>', and every watch call gets a
-- 403. This is the exact trap that file's placeholder creates.
--
-- ── DO THIS IN ORDER ──
-- 1. Generate a real key in your terminal:
--        openssl rand -hex 16
--    That prints 32 lowercase hex characters. COPY IT.
-- 2. Paste it over BOTH <<<PASTE_KEY_HERE>>> markers below and run this file.
-- 3. Enter the SAME value on the watch app (x-watch-key).
-- 4. Re-run `npm run check:phone` — watch_api_key must read
--    "configured (32 chars)". If it still says PLACEHOLDER, step 2 did not take.
--
-- No edge-function redeploy is needed: getSecret() reads per request.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- Refuse to store another placeholder. Without this guard the same silent
-- failure just repeats, and a 403 on the watch is invisible from the phone.
DO $$
DECLARE k TEXT := '<<<PASTE_KEY_HERE>>>';
BEGIN
  IF k ~ '^<' OR length(k) < 16 THEN
    RAISE EXCEPTION 'Refusing to store "%" — that is still the placeholder. Run: openssl rand -hex 16, then paste the result.', k;
  END IF;
  IF k !~ '^[0-9a-f]+$' THEN
    RAISE EXCEPTION 'Key must be lowercase hex (openssl rand -hex 16 output). Got: %', k;
  END IF;
END $$;

INSERT INTO secrets (key, value, updated_at)
VALUES ('watch_api_key', '<<<PASTE_KEY_HERE>>>', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Clear stale telemetry so the next check reflects reality, not old failures.
DELETE FROM secrets WHERE key = 'WATCH_SYNC_HEALTH';

COMMIT;

-- ── VERIFY: must print 32 and 'looks good' ──
SELECT length(value) AS key_len,
       CASE WHEN value ~ '^<' OR length(value) < 16 THEN 'STILL A PLACEHOLDER — step 2 did not take'
            WHEN value ~ '^[0-9a-f]{32}$'            THEN 'looks good — now enter the same value on the watch'
            ELSE 'stored, but not 32 hex chars — double-check it' END AS status
  FROM secrets WHERE key = 'watch_api_key';
