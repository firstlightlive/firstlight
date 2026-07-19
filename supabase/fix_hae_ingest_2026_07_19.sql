-- ─────────────────────────────────────────────────────────────────────────────
-- HAE (Health Auto Export) ingest fixes — 2026-07-19
-- Symptom: HAE data stopped landing since Jul 3. Ingest returned per-day errors
-- and health_metrics stayed empty for most days. Root-caused to three separate
-- guards, each fixed below. Captured here so the repo matches production.
-- ─────────────────────────────────────────────────────────────────────────────

-- FIX 1 (DB) — sleep_log missing updated_at
-- The generic BEFORE UPDATE trigger tr_sleep_log_updated -> update_updated_at()
-- sets NEW.updated_at = now(), but sleep_log was created WITHOUT that column.
-- Every upsert on a day that had sleep took the UPDATE path and threw:
--   "Upsert sleep_log: record \"new\" has no field \"updated_at\"" -> aborted the day.
-- Additive, non-destructive; brings sleep_log in line with its sibling tables.
ALTER TABLE public.sleep_log ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- FIX 2 (code) — daily_logs history lock aborting backfill
-- healthIngest() upserts daily_logs (the SEALED accountability ledger). For past
-- dates the enforce_history_lock trigger correctly refuses edits ("HISTORY LOCKED"),
-- but that throw aborted the day before the raw health_metrics/health_daily writes.
-- Fix wraps the daily_logs upsert in try/catch that swallows ONLY the history lock,
-- so sealed verdicts stay frozen while raw metrics still backfill.
-- See: supabase/functions/firstlight-sync/index.ts (healthIngest, ~line 2628).

-- FIX 3 (config) — Supabase gateway verify_jwt
-- firstlight-sync had verify_jwt=true, so the gateway 401'd HAE (which sends only
-- the x-webhook-secret header) before the request reached the function. Redeployed
-- with --no-verify-jwt; per-action secrets (health_webhook_secret, admin_api_key,
-- watch_api_key) still enforce auth inside the function.
--   supabase functions deploy firstlight-sync --project-ref edgnudrbysybefbqyijq --no-verify-jwt
