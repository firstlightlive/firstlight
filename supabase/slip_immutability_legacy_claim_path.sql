-- ═══════════════════════════════════════════════════════════════════════════
-- FIRST LIGHT — enforce_slip_immutability trigger: LEGACY PAID CLAIM PATH
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds a third penalty-clearance path to the existing immutability trigger,
-- so Chapter 02 REBUILD-era slips that were settled via a paid claim record
-- (and therefore have no Strava walk and no charity_donation receipt) can be
-- transitioned from 'pending' → 'cleared' without violating the trigger.
--
-- Existing paths:
--   1. CHAPTER 02 ENDURANCE — auto_forfeit + charity_donation + proof_url
--   2. CHAPTER 01 LEGACY    — Strava walk activity meeting escalated km target
-- New path:
--   3. LEGACY PAID CLAIM    — a paid row exists in public.claims for this slip
--
-- Originally needed for slip id=25 (2026-06-17 REBUILD miss → ₹15,000 paid
-- directly to Virendra S via UPI, claim id=1, status=paid). The accountability
-- ledger needs the slip to read 'cleared' to drop the escalation banner.
--
-- Idempotent — uses CREATE OR REPLACE FUNCTION.
-- Run in: Supabase Dashboard → SQL Editor.
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
    -- Required for Chapter 02 REBUILD-era slips where the penalty was paid
    -- directly to an individual (not via the auto charity pipeline).
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
