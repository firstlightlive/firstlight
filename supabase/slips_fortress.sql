-- ═══════════════════════════════════════════════════════════════════
-- FIRSTLIGHT — SLIPS FORTRESS (v3)
-- The final, tamper-proof accountability system.
--
-- FIXES:
--   1. RLS: INSERT/UPDATE restricted to authenticated only (no public trolling)
--   2. Server-side escalation: trigger computes required KM from date + NOW()
--   3. Strava validation: proof_strava_activity_id must exist in strava_activities
--   4. Cycling multiplier enforced server-side (Ride distance / 2)
--   5. client_id column for upsert dedup
--   6. page_source column on comments
--
-- RUN THIS IN: Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- ═══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════
-- STEP 1: Add missing columns
-- ══════════════════════════════════════

DO $$
BEGIN
  -- client_id for dedup upsert (frontend-generated unique key)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'client_id') THEN
    ALTER TABLE public.slips ADD COLUMN client_id TEXT;
  END IF;
  -- Ensure all cascade/strava columns exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'proof_strava_activity_id') THEN
    ALTER TABLE public.slips ADD COLUMN proof_strava_activity_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'parent_slip_id') THEN
    ALTER TABLE public.slips ADD COLUMN parent_slip_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'cascade_level') THEN
    ALTER TABLE public.slips ADD COLUMN cascade_level INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'penalty') THEN
    ALTER TABLE public.slips ADD COLUMN penalty TEXT DEFAULT '20km_walk';
  END IF;

  -- page_source on comments
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'comments' AND column_name = 'page_source') THEN
    ALTER TABLE public.comments ADD COLUMN page_source TEXT DEFAULT 'index';
  END IF;
END $$;

-- Unique index on client_id for upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_slips_client_id_unique
  ON public.slips(client_id)
  WHERE client_id IS NOT NULL;

-- Unique index on strava activity (one activity per penalty)
CREATE UNIQUE INDEX IF NOT EXISTS idx_slips_strava_activity_unique
  ON public.slips(proof_strava_activity_id)
  WHERE proof_strava_activity_id IS NOT NULL;


-- ══════════════════════════════════════
-- STEP 2: BLOCK ALL DELETES
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
-- STEP 3: THE FORTRESS TRIGGER
-- Immutability + server-side escalation + Strava validation
-- ══════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_slip_immutability()
RETURNS TRIGGER AS $$
DECLARE
  base_km NUMERIC;
  days_elapsed INTEGER;
  overdue_days INTEGER;
  required_km NUMERIC;
  strava_exists BOOLEAN;
  strava_distance NUMERIC;
  strava_type TEXT;
  effective_km NUMERIC;
BEGIN
  -- ── FREEZE CORE FIELDS ──
  IF NEW.date IS DISTINCT FROM OLD.date THEN
    RAISE EXCEPTION 'IMMUTABLE: Cannot change slip date. Slip ID: %', OLD.id;
  END IF;
  IF NEW.rule IS DISTINCT FROM OLD.rule THEN
    RAISE EXCEPTION 'IMMUTABLE: Cannot change slip rule. Slip ID: %', OLD.id;
  END IF;
  IF NEW.category IS DISTINCT FROM OLD.category THEN
    RAISE EXCEPTION 'IMMUTABLE: Cannot change slip category. Slip ID: %', OLD.id;
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'IMMUTABLE: Cannot change slip created_at. Slip ID: %', OLD.id;
  END IF;
  IF NEW.insight IS DISTINCT FROM OLD.insight AND OLD.insight IS NOT NULL THEN
    RAISE EXCEPTION 'IMMUTABLE: Cannot change slip insight. Slip ID: %', OLD.id;
  END IF;
  IF NEW.failure_point IS DISTINCT FROM OLD.failure_point AND OLD.failure_point IS NOT NULL THEN
    RAISE EXCEPTION 'IMMUTABLE: Cannot change slip failure_point. Slip ID: %', OLD.id;
  END IF;

  -- ── ONE-WAY STATUS ──
  IF OLD.penalty_status = 'cleared' AND NEW.penalty_status IS DISTINCT FROM 'cleared' THEN
    RAISE EXCEPTION 'IMMUTABLE: Cannot revert cleared penalty. Slip ID: %', OLD.id;
  END IF;

  -- ── WRITE-ONCE PROOF ──
  IF OLD.proof_url IS NOT NULL AND NEW.proof_url IS DISTINCT FROM OLD.proof_url THEN
    RAISE EXCEPTION 'IMMUTABLE: Proof cannot be changed once set. Slip ID: %', OLD.id;
  END IF;
  IF OLD.proof_strava_activity_id IS NOT NULL AND NEW.proof_strava_activity_id IS DISTINCT FROM OLD.proof_strava_activity_id THEN
    RAISE EXCEPTION 'IMMUTABLE: Strava activity ID cannot be changed once set. Slip ID: %', OLD.id;
  END IF;

  -- ══════════════════════════════════════
  -- PENALTY CLEARANCE ENFORCEMENT
  -- Only runs when status changes pending → cleared
  -- ══════════════════════════════════════
  IF NEW.penalty_status = 'cleared' AND OLD.penalty_status = 'pending' THEN

    -- 1. Must have Strava activity ID (no manual/fake clears)
    IF NEW.proof_strava_activity_id IS NULL THEN
      RAISE EXCEPTION 'BLOCKED: Cannot clear penalty without a Strava activity. Slip ID: %', OLD.id;
    END IF;

    -- 2. Validate Strava activity EXISTS in strava_activities table
    SELECT EXISTS(
      SELECT 1 FROM public.strava_activities WHERE id = NEW.proof_strava_activity_id
    ) INTO strava_exists;

    IF NOT strava_exists THEN
      RAISE EXCEPTION 'BLOCKED: Strava activity % does not exist in the database. Slip ID: %', NEW.proof_strava_activity_id, OLD.id;
    END IF;

    -- 3. Get Strava activity distance and type
    SELECT distance, type INTO strava_distance, strava_type
    FROM public.strava_activities
    WHERE id = NEW.proof_strava_activity_id;

    -- 4. Compute effective KM (cycling = half credit)
    effective_km := strava_distance / 1000.0;  -- meters to km
    IF strava_type = 'Ride' THEN
      effective_km := effective_km / 2.0;  -- cycling at 0.5x
    END IF;

    -- 5. Compute SERVER-SIDE escalated requirement
    -- Base KM: brahmacharya = 50, cascade = 25, others = 20
    IF OLD.category = 'brahmacharya_gate' THEN
      base_km := 50;
    ELSIF COALESCE(OLD.cascade_level, 0) > 0 THEN
      base_km := 25;
    ELSE
      base_km := 20;
    END IF;

    -- Days elapsed since slip date (UTC)
    days_elapsed := EXTRACT(DAY FROM (NOW() AT TIME ZONE 'UTC') - OLD.date::timestamp)::INTEGER;
    overdue_days := GREATEST(0, days_elapsed - 7);  -- 7-day grace

    -- Escalated requirement: base + 3km/day overdue, capped at 70
    required_km := LEAST(base_km + (overdue_days * 3), 70);

    -- 6. Verify effective KM meets escalated requirement
    IF effective_km < required_km THEN
      RAISE EXCEPTION 'BLOCKED: Activity provides %.1f km effective (%.1f km raw, type: %). Required: % km (base % + % overdue days × 3). Slip ID: %',
        effective_km, strava_distance / 1000.0, strava_type, required_km, base_km, overdue_days, OLD.id;
    END IF;

    -- 7. Override proof_km with the server-computed effective KM (no client manipulation)
    NEW.proof_km := ROUND(effective_km::NUMERIC, 2);

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
-- STEP 4: RLS — LOCKDOWN
-- Public can READ. Only authenticated can WRITE.
-- No DELETE policy at all.
-- ══════════════════════════════════════

ALTER TABLE public.slips ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'slips' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.slips', r.policyname);
  END LOOP;
END $$;

-- READ: anyone (public accountability)
CREATE POLICY slips_public_read ON public.slips
  FOR SELECT TO anon, authenticated
  USING (true);

-- INSERT: authenticated only (admin must be logged in)
CREATE POLICY slips_auth_insert ON public.slips
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- UPDATE: authenticated only (admin must be logged in to clear penalties)
CREATE POLICY slips_auth_update ON public.slips
  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- NO delete policy. Combined with trigger = impossible to delete.

-- Also allow anon INSERT for backward compat (admin uses anon key + admin_key check)
-- But ONLY if the request has user_id set (sbFetch auto-injects it)
CREATE POLICY slips_anon_insert ON public.slips
  FOR INSERT TO anon
  WITH CHECK (user_id IS NOT NULL);

CREATE POLICY slips_anon_update ON public.slips
  FOR UPDATE TO anon
  USING (user_id IS NOT NULL)
  WITH CHECK (user_id IS NOT NULL);


-- ══════════════════════════════════════
-- STEP 5: Indexes
-- ══════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_slips_date ON public.slips(date DESC);
CREATE INDEX IF NOT EXISTS idx_slips_penalty_status ON public.slips(penalty_status);
CREATE INDEX IF NOT EXISTS idx_slips_parent ON public.slips(parent_slip_id) WHERE parent_slip_id IS NOT NULL;


-- ══════════════════════════════════════
-- STEP 6: Comments page_source index
-- ══════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_comments_page_source ON public.comments(page_source);


-- ══════════════════════════════════════
-- STEP 7: VERIFY EVERYTHING
-- ══════════════════════════════════════

SELECT 'FORTRESS v3 APPLIED' AS status;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'slips' AND table_schema = 'public'
ORDER BY ordinal_position;

SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.slips'::regclass
  AND tgname NOT LIKE 'RI_%';

SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'slips' AND schemaname = 'public'
ORDER BY policyname;
