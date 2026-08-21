-- ═══════════════════════════════════════════════════════════════════
-- FIRSTLIGHT — RESET MODULE  (private porn / compulsion recovery tracker)
--
-- Powers website/reset.html. Everything here is PRIVATE — granted to the
-- authenticated (logged-in owner) + service_role only. anon gets NOTHING.
-- This is the most personal data on the site; it must never be anon-readable.
--
-- The core rule (owner's design, enforced hard):
--   • Each day must be CONFIRMED CLEAN by 12:00 noon IST the NEXT day.
--   • Miss the deadline → the system ASSUMES a relapse and auto-logs it.
--   • Every relapse (manual or auto) assigns a PUNISHMENT CYCLE:
--       50 km walk + 200 km cycle, due within 7 days, one task starts tonight.
--   • Streak resets to 0 on any relapse.
--
-- Enforcement lives in reset_noon_sweep() run by pg_cron at 30 6 * * * UTC
-- ( = 12:00 IST ). The client (reset.html) mirrors the same sweep on load so
-- the UI reacts instantly; both are idempotent (ON CONFLICT DO NOTHING).
-- Two pre-noon REMINDER crons (09:00 + 11:30 IST) call edge action
-- 'reset-reminder' → emails (Resend) ONLY if a day is still at risk, so you
-- get a warning with time to confirm before the sweep converts it to a relapse.
--
-- RUN IN: Supabase Dashboard > SQL Editor. Safe to re-run (idempotent).
-- ═══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════
-- TABLE 1: reset_state  (singleton config: start date + manifesto)
-- ══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.reset_state (
  id          TEXT PRIMARY KEY DEFAULT 'me',
  start_date  DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  manifesto   TEXT DEFAULT '',            -- "why I want to be free" — read when tempted
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the singleton (only if missing)
INSERT INTO public.reset_state (id) VALUES ('me')
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════
-- TABLE 2: reset_days  (clean confirmations — one row per confirmed-clean day)
-- ══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.reset_days (
  d             DATE PRIMARY KEY,          -- the day being confirmed clean
  clean         BOOLEAN NOT NULL DEFAULT TRUE,
  confirmed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════
-- TABLE 3: reset_relapses  (the story — one row per calendar day, idempotent)
-- ══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.reset_relapses (
  id            BIGSERIAL PRIMARY KEY,
  occurred_on   DATE NOT NULL UNIQUE,       -- one relapse per day → auto-log idempotency
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  triggers      TEXT[]  DEFAULT '{}',       -- bored, stressed, lonely, tired, urge, late-scroll, notification...
  sites         TEXT[]  DEFAULT '{}',       -- which sites/apps — surfaces the pattern to block
  duration_min  INTEGER,
  mood_before   TEXT,
  mood_after    TEXT,
  story         TEXT,                        -- "what happened / why did I do it" (personal)
  auto          BOOLEAN NOT NULL DEFAULT FALSE,  -- true = system-assumed (missed noon deadline)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════
-- TABLE 4: reset_punishments  (penance owed in distance — one per relapse day)
-- ══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.reset_punishments (
  id            BIGSERIAL PRIMARY KEY,
  relapse_on    DATE NOT NULL UNIQUE,       -- ties to reset_relapses.occurred_on
  assigned_on   DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  deadline      DATE NOT NULL,              -- assigned_on + 7 (a week to burn it down)
  cycle_km      INTEGER NOT NULL DEFAULT 200,
  walk_km       INTEGER NOT NULL DEFAULT 50,
  cycle_done    NUMERIC NOT NULL DEFAULT 0,
  walk_done     NUMERIC NOT NULL DEFAULT 0,
  night_started BOOLEAN NOT NULL DEFAULT FALSE, -- "at least one starts tonight"
  cleared       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════
-- TABLE 5: reset_urges  (urges RESISTED — the positive counter-metric)
-- ══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.reset_urges (
  id           BIGSERIAL PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  note         TEXT,
  beaten       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_reset_relapses_on    ON public.reset_relapses(occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_reset_punish_open    ON public.reset_punishments(cleared, deadline);
CREATE INDEX IF NOT EXISTS idx_reset_urges_at       ON public.reset_urges(occurred_at DESC);

-- ══════════════════════════════════════
-- reset_state.updated_at auto-touch
-- ══════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reset_state_touch()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reset_state_touch_t ON public.reset_state;
CREATE TRIGGER reset_state_touch_t
  BEFORE UPDATE ON public.reset_state
  FOR EACH ROW EXECUTE FUNCTION public.reset_state_touch();

-- keep cleared flag honest on every punishment write
CREATE OR REPLACE FUNCTION public.reset_punish_clear()
RETURNS TRIGGER AS $$
BEGIN
  NEW.cleared = (NEW.cycle_done >= NEW.cycle_km AND NEW.walk_done >= NEW.walk_km);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reset_punish_clear_t ON public.reset_punishments;
CREATE TRIGGER reset_punish_clear_t
  BEFORE INSERT OR UPDATE ON public.reset_punishments
  FOR EACH ROW EXECUTE FUNCTION public.reset_punish_clear();

-- ══════════════════════════════════════
-- RLS — private, authenticated owner only (anon has NO access)
-- ══════════════════════════════════════
ALTER TABLE public.reset_state       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reset_days        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reset_relapses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reset_punishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reset_urges       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('reset_state','reset_days','reset_relapses','reset_punishments','reset_urges')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename); END LOOP;
END $$;

-- One ALL-command policy per table, authenticated only.
CREATE POLICY reset_state_owner       ON public.reset_state       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY reset_days_owner        ON public.reset_days        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY reset_relapses_owner    ON public.reset_relapses    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY reset_punishments_owner ON public.reset_punishments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY reset_urges_owner       ON public.reset_urges       FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════
-- GRANTS — authenticated + service_role (anon deliberately excluded)
-- ══════════════════════════════════════
GRANT USAGE ON SCHEMA public TO authenticated;
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['reset_state','reset_days','reset_relapses','reset_punishments','reset_urges'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', tbl);
  END LOOP;
END $$;
-- bigserial sequences need USAGE for authenticated inserts under RLS
GRANT USAGE, SELECT ON SEQUENCE public.reset_relapses_id_seq    TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.reset_punishments_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.reset_urges_id_seq       TO authenticated;

-- ══════════════════════════════════════
-- reset_noon_sweep() — the enforcer. SECURITY DEFINER → bypasses RLS.
-- For every past day up to the noon cutoff with no clean-confirmation and no
-- relapse, auto-log a relapse + assign the 50 walk / 200 cycle punishment.
-- ══════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reset_noon_sweep()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s       DATE;
  dd      DATE;   -- loop cursor; NOT named 'd' — that collides with reset_days.d
  cutoff  DATE;
  istnow  TIMESTAMP := (now() AT TIME ZONE 'Asia/Kolkata');
  n       INTEGER := 0;
BEGIN
  SELECT start_date INTO s FROM public.reset_state WHERE id = 'me';
  IF s IS NULL THEN RETURN 0; END IF;

  -- Day D's deadline is noon of D+1. cutoff = latest day whose deadline has passed.
  IF istnow::time >= TIME '12:00' THEN
    cutoff := istnow::date - 1;          -- after noon today → yesterday is now due/overdue
  ELSE
    cutoff := istnow::date - 2;          -- before noon today → yesterday still in grace window
  END IF;

  dd := s;
  WHILE dd <= cutoff LOOP
    IF NOT EXISTS (SELECT 1 FROM public.reset_days rd WHERE rd.d = dd AND rd.clean)
       AND NOT EXISTS (SELECT 1 FROM public.reset_relapses rr WHERE rr.occurred_on = dd)
    THEN
      INSERT INTO public.reset_relapses (occurred_on, triggers, story, auto)
        VALUES (dd, ARRAY['missed-checkin'],
                'Auto-logged: no clean-confirmation by 12:00 noon deadline.', TRUE)
        ON CONFLICT (occurred_on) DO NOTHING;

      INSERT INTO public.reset_punishments (relapse_on, assigned_on, deadline)
        VALUES (dd, dd, dd + 7)
        ON CONFLICT (relapse_on) DO NOTHING;

      n := n + 1;
    END IF;
    dd := dd + 1;
  END LOOP;

  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_noon_sweep() TO service_role, authenticated;

-- ══════════════════════════════════════
-- CRON — run the sweep at 12:00 IST (30 6 * * * UTC) every day.
-- (Re-schedule safe: unschedule if it already exists.)
-- ══════════════════════════════════════
DO $$
BEGIN
  PERFORM cron.unschedule('reset_noon_sweep');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('reset_noon_sweep', '30 6 * * *', $$SELECT public.reset_noon_sweep()$$);

-- ══════════════════════════════════════
-- PRE-NOON REMINDERS (fire BEFORE the sweep) — email only if a day is at risk.
-- Handled by edge action 'reset-reminder' via firstlight_cron_call (Resend).
-- IST → UTC:  09:00 IST = 03:30 UTC (early nudge) · 11:30 IST = 06:00 UTC (last call)
-- Sweep stays at 12:00 IST = 06:30 UTC, so both reminders land before it.
-- Requires firstlight-sync deployed WITH the reset-reminder action + admin_api_key
-- in the secrets table (already used by every other cron).
-- ══════════════════════════════════════
DO $$ BEGIN PERFORM cron.unschedule('reset_reminder_early'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('reset_reminder_final'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('reset_reminder_early', '30 3 * * *', $$SELECT public.firstlight_cron_call('reset-reminder')$$);
SELECT cron.schedule('reset_reminder_final', '0 6 * * *',  $$SELECT public.firstlight_cron_call('reset-reminder')$$);

-- ══════════════════════════════════════
-- VERIFY
-- ══════════════════════════════════════
SELECT 'RESET MODULE READY' AS status;
SELECT jobname, schedule FROM cron.job WHERE jobname IN ('reset_noon_sweep','reset_reminder_early','reset_reminder_final') ORDER BY jobname;
SELECT * FROM public.reset_state;
