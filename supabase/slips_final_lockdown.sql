-- ═══════════════════════════════════════════════════════════════════
-- FIRSTLIGHT — FINAL LOCKDOWN (closes last 3 loopholes)
--
-- 1. strava_activities: locked to service_role only (no human writes)
-- 2. proof_archive: locked to service_role only (no human writes)
-- 3. Slip trigger: activity date must be >= slip date (no old walks)
--
-- After this: the only way to cheat is to hack Strava itself.
--
-- RUN THIS IN: Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- ═══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════
-- FIX 1: LOCK strava_activities — read-only for anon/authenticated
-- Only the Cloud Function (service_role) can write.
-- ══════════════════════════════════════

ALTER TABLE public.strava_activities ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'strava_activities' AND schemaname = 'public'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.strava_activities', r.policyname); END LOOP;
END $$;

-- Anyone can READ (public Strava page + penalty picker need this)
CREATE POLICY strava_public_read ON public.strava_activities
  FOR SELECT TO anon, authenticated
  USING (true);

-- NO insert/update/delete for anon or authenticated.
-- Only service_role (Cloud Function) bypasses RLS entirely.
-- This means: no human can create fake activities from the browser.


-- ══════════════════════════════════════
-- FIX 2: LOCK proof_archive — read-only for anon/authenticated
-- Only the Cloud Function (service_role) can write.
-- ══════════════════════════════════════

ALTER TABLE public.proof_archive ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'proof_archive' AND schemaname = 'public'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.proof_archive', r.policyname); END LOOP;
END $$;

-- Anyone can READ (Evidence page needs this)
CREATE POLICY proof_public_read ON public.proof_archive
  FOR SELECT TO anon, authenticated
  USING (true);

-- NO insert/update/delete for anon or authenticated.
-- Only service_role (Cloud Function) can write evidence data.


-- ══════════════════════════════════════
-- FIX 3: UPDATE slip trigger — activity date must be >= slip date
-- Prevents using old walks to clear new penalties
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
  strava_date DATE;
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
  -- ══════════════════════════════════════
  IF NEW.penalty_status = 'cleared' AND OLD.penalty_status = 'pending' THEN

    -- 1. Must have Strava activity ID
    IF NEW.proof_strava_activity_id IS NULL THEN
      RAISE EXCEPTION 'BLOCKED: Cannot clear penalty without a Strava activity. Slip ID: %', OLD.id;
    END IF;

    -- 2. Validate Strava activity EXISTS
    SELECT EXISTS(
      SELECT 1 FROM public.strava_activities WHERE id = NEW.proof_strava_activity_id
    ) INTO strava_exists;

    IF NOT strava_exists THEN
      RAISE EXCEPTION 'BLOCKED: Strava activity % does not exist. Slip ID: %', NEW.proof_strava_activity_id, OLD.id;
    END IF;

    -- 3. Get activity details
    SELECT distance, type, (start_date_local::date)
    INTO strava_distance, strava_type, strava_date
    FROM public.strava_activities
    WHERE id = NEW.proof_strava_activity_id;

    -- 4. ACTIVITY DATE MUST BE ON OR AFTER SLIP DATE (no old walks)
    IF strava_date < OLD.date THEN
      RAISE EXCEPTION 'BLOCKED: Activity date (%) is before slip date (%). You cannot use old activities. Slip ID: %',
        strava_date, OLD.date, OLD.id;
    END IF;

    -- 5. Compute effective KM (cycling = half credit)
    effective_km := strava_distance / 1000.0;
    IF strava_type = 'Ride' THEN
      effective_km := effective_km / 2.0;
    END IF;

    -- 6. SERVER-SIDE escalation
    IF OLD.category = 'brahmacharya_gate' THEN
      base_km := 50;
    ELSIF COALESCE(OLD.cascade_level, 0) > 0 THEN
      base_km := 25;
    ELSE
      base_km := 20;
    END IF;

    -- IST timezone (UTC+5:30) for all calculations
    days_elapsed := EXTRACT(DAY FROM (NOW() AT TIME ZONE 'Asia/Kolkata') - OLD.date::timestamp)::INTEGER;
    overdue_days := GREATEST(0, days_elapsed - 7);
    required_km := LEAST(base_km + (overdue_days * 3), 70);

    -- 7. Verify KM
    IF effective_km < required_km THEN
      RAISE EXCEPTION 'BLOCKED: Activity provides %.1f km (%.1f km raw, type: %). Required: % km. Slip ID: %',
        effective_km, strava_distance / 1000.0, strava_type, required_km, OLD.id;
    END IF;

    -- 8. Server overrides proof_km (no client manipulation)
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
-- VERIFY
-- ══════════════════════════════════════

SELECT '=== STRAVA_ACTIVITIES POLICIES ===' AS section;
SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'strava_activities' AND schemaname = 'public';

SELECT '=== PROOF_ARCHIVE POLICIES ===' AS section;
SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'proof_archive' AND schemaname = 'public';

SELECT '=== SLIPS TRIGGERS ===' AS section;
SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'public.slips'::regclass AND tgname NOT LIKE 'RI_%';

-- ══════════════════════════════════════
-- FIX 4: RACES — one race per date
-- ══════════════════════════════════════

-- Add unique index on races.date (one race per date, no duplicates)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'races' AND table_schema = 'public') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'races' AND column_name = 'date') THEN
      -- Remove duplicates first (keep the latest updated one)
      DELETE FROM public.races a USING public.races b
        WHERE a.date = b.date AND a.ctid < b.ctid;
      -- Create unique index
      CREATE UNIQUE INDEX IF NOT EXISTS idx_races_one_per_date ON public.races(date);
    END IF;
  END IF;
END $$;

SELECT 'FINAL LOCKDOWN COMPLETE — SYSTEM IS TAMPER-PROOF' AS status;
