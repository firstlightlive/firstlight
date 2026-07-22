-- ═══════════════════════════════════════════════════════════════════════════
-- FIRST LIGHT — enforce_slip_immutability: PATH 4 (VERDICT-REVISED FALSE MISS)
-- ═══════════════════════════════════════════════════════════════════════════
-- Fixes the 2026-07-21 silent failure: a late-synced Afternoon Walk (5.04 km)
-- correctly flipped Day 3 MISS → WIN, but the engine's grace re-check could NOT
-- clear slip id=32 because the immutability trigger (a) froze `insight` and
-- (b) refused to clear an auto_forfeit/charity_donation slip without a
-- proof_url receipt. A false miss has no receipt — nothing was ever owed — so
-- the phantom ₹1,500 slip stuck 'pending' and the Receipts panel nagged on a
-- day that was actually a WIN. It took a manual SQL void (void_false_miss_2026-07-21.sql).
--
-- This adds a FOURTH, self-validating clearance path so grace can retract a
-- phantom slip on its own — WITHOUT weakening immutability for real misses:
--   PATH 4 fires ONLY when
--     • the slip is an auto_forfeit (engine-booked) slip, AND
--     • the penalty is being ZEROED (NEW.penalty_amount = 0), AND
--     • proof_archive for that date genuinely records verdict = 'WIN'.
--   A real, owed miss keeps proof_archive.verdict = 'MISS', so PATH 4 can never
--   fire for it — it still needs a receipt via PATH 1. And the engine's grace
--   re-check no longer touches `insight`, so the freeze at the top is not hit.
--
-- Paired with the runGrace change in supabase/functions/firstlight-sync/index.ts
-- (updates only penalty_status + penalty_amount, and ALERTS on any failure
-- instead of swallowing it) and the extra grace sweeps in extend_grace_cron.sql.
--
-- Idempotent — CREATE OR REPLACE. Run in: Supabase Dashboard → SQL Editor.
-- Supersedes slip_immutability_legacy_claim_path.sql (keeps all its paths).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enforce_slip_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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

    -- ── PATH 4: VERDICT REVISED (false miss, nothing owed) ──
    -- A late-synced activity turned this day MISS → WIN after the nightly
    -- verdict. proof_archive now records WIN, so there is no debt and no
    -- receipt. Let the engine's grace re-check zero + clear the phantom slip.
    -- Guarded three ways so it can NEVER clear a real, owed miss:
    --   1. auto_forfeit only (engine-booked slips)
    --   2. the penalty must be zeroed in the same update
    --   3. proof_archive for this date must genuinely say WIN
    IF OLD.category = 'auto_forfeit'
       AND NEW.penalty_amount = 0
       AND EXISTS (
         SELECT 1 FROM public.proof_archive
         WHERE date = OLD.date AND verdict = 'WIN'
       ) THEN
      RETURN NEW;
    END IF;

    -- ── PATH 1: CHAPTER 02 ENDURANCE ──
    -- auto_forfeit slip cleared via charity receipt
    IF OLD.category = 'auto_forfeit' AND OLD.penalty = 'charity_donation' THEN
      IF NEW.proof_url IS NULL THEN
        RAISE EXCEPTION 'BLOCKED: Cannot clear charity-donation slip without proof_url (receipt). Slip ID: %', OLD.id;
      END IF;
      RETURN NEW;
    END IF;

    -- ── PATH 2: LEGACY PAID CLAIM ──
    -- A paid row in public.claims exists for this slip — receipt is in the
    -- claim record itself (UPI screenshot, direct beneficiary payment, etc.).
    IF EXISTS (
      SELECT 1 FROM public.claims
      WHERE slip_id = OLD.id AND status = 'paid'
    ) THEN
      RETURN NEW;
    END IF;

    -- ── PATH 3: CHAPTER 01 LEGACY (Strava walk) ──
    IF NEW.proof_strava_activity_id IS NULL THEN
      RAISE EXCEPTION 'BLOCKED: Cannot clear penalty without a Strava activity. Slip ID: %', OLD.id;
    END IF;

    SELECT EXISTS(SELECT 1 FROM public.strava_activities WHERE id = NEW.proof_strava_activity_id)
    INTO strava_exists;
    IF NOT strava_exists THEN
      RAISE EXCEPTION 'BLOCKED: Strava activity % does not exist. Slip ID: %', NEW.proof_strava_activity_id, OLD.id;
    END IF;

    SELECT distance, type, (start_date_local::date)
    INTO strava_distance, strava_type, strava_date
    FROM public.strava_activities WHERE id = NEW.proof_strava_activity_id;

    IF strava_date < OLD.date THEN
      RAISE EXCEPTION 'BLOCKED: Activity date (%) is before slip date (%). Slip ID: %',
        strava_date, OLD.date, OLD.id;
    END IF;

    effective_km := strava_distance / 1000.0;
    IF strava_type = 'Ride' THEN effective_km := effective_km / 2.0; END IF;

    IF OLD.category = 'brahmacharya_gate' THEN base_km := 50;
    ELSIF COALESCE(OLD.cascade_level, 0) > 0 THEN base_km := 25;
    ELSE base_km := 20; END IF;

    days_elapsed := EXTRACT(DAY FROM (NOW() AT TIME ZONE 'Asia/Kolkata') - OLD.date::timestamp)::INTEGER;
    overdue_days := GREATEST(0, days_elapsed - 7);
    required_km := LEAST(base_km + (overdue_days * 3), 70);

    IF effective_km < required_km THEN
      RAISE EXCEPTION 'BLOCKED: Activity provides %.1f km (%.1f km raw, type: %). Required: % km. Slip ID: %',
        effective_km, strava_distance / 1000.0, strava_type, required_km, OLD.id;
    END IF;

    NEW.proof_km := ROUND(effective_km::NUMERIC, 2);
  END IF;

  RETURN NEW;
END;
$function$;

-- ── VERIFY ──
-- SELECT pg_get_functiondef(p.oid) AS src
-- FROM pg_proc p JOIN pg_trigger t ON t.tgfoid = p.oid
-- WHERE t.tgname='enforce_slip_immutability' LIMIT 1;
