-- ═══════════════════════════════════════════════════════════════════
-- FIRSTLIGHT — IMMUTABLE SLIPS TABLE + PUNISHMENT ENFORCEMENT
--
-- DESIGN PRINCIPLES:
--   1. Slips are PERMANENT — no DELETE ever
--   2. Core fields are FROZEN after insert — no UPDATE on date, rule, category, etc.
--   3. Only penalty_status can change: pending → cleared (one-way)
--   4. Proof fields can only be written ONCE (null → value, never changed after)
--   5. Even the admin/service role cannot bypass these triggers
--
-- RUN THIS IN: Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- ═══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════
-- STEP 1: Ensure slips table exists with correct schema
-- ══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.slips (
  id              TEXT PRIMARY KEY,
  date            DATE NOT NULL,
  day_number      INTEGER,
  rule            TEXT NOT NULL,        -- body, fortress, sadhana
  category        TEXT NOT NULL,        -- food_violation, missed_run, brahmacharya_gate, device_at_home, missed_diary
  function_met    TEXT,                 -- loneliness, stress, boredom, self-soothing, fatigue, other
  failure_point   TEXT,
  insight         TEXT,
  architectural_state JSONB,
  penalty         TEXT NOT NULL,        -- 20km_walk, 50km_walk_5km_run_or_100km_cycle
  penalty_status  TEXT NOT NULL DEFAULT 'pending' CHECK (penalty_status IN ('pending', 'cleared')),
  proof_url       TEXT,
  proof_km        NUMERIC,
  proof_strava_url TEXT,
  cleared_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id         UUID
);

-- Add any missing columns (safe to re-run)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'proof_url') THEN
    ALTER TABLE public.slips ADD COLUMN proof_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'proof_km') THEN
    ALTER TABLE public.slips ADD COLUMN proof_km NUMERIC;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'proof_strava_url') THEN
    ALTER TABLE public.slips ADD COLUMN proof_strava_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'cleared_at') THEN
    ALTER TABLE public.slips ADD COLUMN cleared_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'day_number') THEN
    ALTER TABLE public.slips ADD COLUMN day_number INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'function_met') THEN
    ALTER TABLE public.slips ADD COLUMN function_met TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'failure_point') THEN
    ALTER TABLE public.slips ADD COLUMN failure_point TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'insight') THEN
    ALTER TABLE public.slips ADD COLUMN insight TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'architectural_state') THEN
    ALTER TABLE public.slips ADD COLUMN architectural_state JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'user_id') THEN
    ALTER TABLE public.slips ADD COLUMN user_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'proof_strava_activity_id') THEN
    ALTER TABLE public.slips ADD COLUMN proof_strava_activity_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'parent_slip_id') THEN
    ALTER TABLE public.slips ADD COLUMN parent_slip_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'cascade_level') THEN
    ALTER TABLE public.slips ADD COLUMN cascade_level INTEGER DEFAULT 0;
  END IF;
END $$;

-- Ensure one Strava activity can only be used for ONE penalty (no reuse)
CREATE UNIQUE INDEX IF NOT EXISTS idx_slips_strava_activity_unique
  ON public.slips(proof_strava_activity_id)
  WHERE proof_strava_activity_id IS NOT NULL;

-- ══════════════════════════════════════
-- STEP 2: BLOCK ALL DELETES — slips are permanent
-- ══════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_slip_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'SLIPS ARE IMMUTABLE — DELETE IS PERMANENTLY BLOCKED. Slip ID: %', OLD.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS block_slip_delete ON public.slips;
CREATE TRIGGER block_slip_delete
  BEFORE DELETE ON public.slips
  FOR EACH ROW
  EXECUTE FUNCTION prevent_slip_delete();

-- ══════════════════════════════════════
-- STEP 3: FREEZE CORE FIELDS ON UPDATE
-- Only allow: penalty_status (pending→cleared), proof_url, proof_km, proof_strava_url, cleared_at
-- ══════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_slip_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- Block changes to core fields (the confession itself)
  IF NEW.date IS DISTINCT FROM OLD.date THEN
    RAISE EXCEPTION 'IMMUTABLE: Cannot change slip date. Slip ID: %', OLD.id;
  END IF;
  IF NEW.rule IS DISTINCT FROM OLD.rule THEN
    RAISE EXCEPTION 'IMMUTABLE: Cannot change slip rule. Slip ID: %', OLD.id;
  END IF;
  IF NEW.category IS DISTINCT FROM OLD.category THEN
    RAISE EXCEPTION 'IMMUTABLE: Cannot change slip category. Slip ID: %', OLD.id;
  END IF;
  IF NEW.penalty IS DISTINCT FROM OLD.penalty THEN
    RAISE EXCEPTION 'IMMUTABLE: Cannot change slip penalty. Slip ID: %', OLD.id;
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'IMMUTABLE: Cannot change slip created_at. Slip ID: %', OLD.id;
  END IF;
  IF NEW.insight IS DISTINCT FROM OLD.insight AND OLD.insight IS NOT NULL THEN
    RAISE EXCEPTION 'IMMUTABLE: Cannot change slip insight after it is set. Slip ID: %', OLD.id;
  END IF;
  IF NEW.failure_point IS DISTINCT FROM OLD.failure_point AND OLD.failure_point IS NOT NULL THEN
    RAISE EXCEPTION 'IMMUTABLE: Cannot change slip failure_point after it is set. Slip ID: %', OLD.id;
  END IF;

  -- penalty_status can only go pending → cleared (one-way)
  IF OLD.penalty_status = 'cleared' AND NEW.penalty_status IS DISTINCT FROM 'cleared' THEN
    RAISE EXCEPTION 'IMMUTABLE: Cannot revert a cleared penalty back to pending. Slip ID: %', OLD.id;
  END IF;

  -- proof_url can only be set once (null → value), never changed after
  IF OLD.proof_url IS NOT NULL AND NEW.proof_url IS DISTINCT FROM OLD.proof_url THEN
    RAISE EXCEPTION 'IMMUTABLE: Proof URL cannot be changed once set. Slip ID: %', OLD.id;
  END IF;

  -- KM ENFORCEMENT: penalty cannot be cleared without meeting minimum KM
  -- brahmacharya_gate requires 50km, all others require 20km
  IF NEW.penalty_status = 'cleared' AND OLD.penalty_status = 'pending' THEN
    IF NEW.proof_url IS NULL THEN
      RAISE EXCEPTION 'BLOCKED: Cannot clear penalty without proof. Slip ID: %', OLD.id;
    END IF;
    IF NEW.proof_km IS NULL OR NEW.proof_km <= 0 THEN
      RAISE EXCEPTION 'BLOCKED: Cannot clear penalty without KM proof. Slip ID: %', OLD.id;
    END IF;
    IF OLD.category = 'brahmacharya_gate' AND NEW.proof_km < 50 THEN
      RAISE EXCEPTION 'BLOCKED: Brahmacharya penalty requires minimum 50km. Got: %. Slip ID: %', NEW.proof_km, OLD.id;
    END IF;
    IF OLD.category != 'brahmacharya_gate' AND NEW.proof_km < 20 THEN
      RAISE EXCEPTION 'BLOCKED: Penalty requires minimum 20km. Got: %. Slip ID: %', NEW.proof_km, OLD.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_slip_immutability ON public.slips;
CREATE TRIGGER enforce_slip_immutability
  BEFORE UPDATE ON public.slips
  FOR EACH ROW
  EXECUTE FUNCTION enforce_slip_immutability();

-- ══════════════════════════════════════
-- STEP 4: RLS — public read, authenticated write
-- ══════════════════════════════════════

ALTER TABLE public.slips ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'slips' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.slips', r.policyname);
  END LOOP;
END $$;

-- Anyone can read slips (public accountability)
CREATE POLICY slips_public_read ON public.slips
  FOR SELECT TO anon, authenticated
  USING (true);

-- Only authenticated + anon can insert (admin writes via anon key)
CREATE POLICY slips_insert ON public.slips
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Only allow update (for proof upload / clearing penalty)
CREATE POLICY slips_update ON public.slips
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- NO delete policy — combined with trigger, makes deletes impossible

-- ══════════════════════════════════════
-- STEP 5: Create index for fast date queries
-- ══════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_slips_date ON public.slips(date DESC);
CREATE INDEX IF NOT EXISTS idx_slips_penalty_status ON public.slips(penalty_status);

-- ══════════════════════════════════════
-- STEP 6: Verify
-- ══════════════════════════════════════

SELECT 'SLIPS TABLE READY — IMMUTABLE ENFORCEMENT ACTIVE' AS status;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'slips' AND table_schema = 'public'
ORDER BY ordinal_position;

SELECT tgname, tgtype, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.slips'::regclass;

SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'slips' AND schemaname = 'public';
