-- ═══════════════════════════════════════════════════════════════════
-- FIRSTLIGHT — SLIPS HOTFIX
-- Adds missing 'penalty' column + fixes trigger for BIGINT id
--
-- RUN THIS IN: Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- ═══════════════════════════════════════════════════════════════════

-- Add missing 'penalty' column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slips' AND column_name = 'penalty') THEN
    ALTER TABLE public.slips ADD COLUMN penalty TEXT DEFAULT '20km_walk';
  END IF;
END $$;

-- Re-apply triggers (they reference OLD.id which works with any type)

-- BLOCK ALL DELETES
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

-- FREEZE CORE FIELDS + KM ENFORCEMENT
CREATE OR REPLACE FUNCTION enforce_slip_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- Block changes to core fields
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

  -- penalty_status: one-way only (pending → cleared)
  IF OLD.penalty_status = 'cleared' AND NEW.penalty_status IS DISTINCT FROM 'cleared' THEN
    RAISE EXCEPTION 'IMMUTABLE: Cannot revert cleared penalty. Slip ID: %', OLD.id;
  END IF;

  -- proof_url: write-once
  IF OLD.proof_url IS NOT NULL AND NEW.proof_url IS DISTINCT FROM OLD.proof_url THEN
    RAISE EXCEPTION 'IMMUTABLE: Proof cannot be changed once set. Slip ID: %', OLD.id;
  END IF;

  -- KM ENFORCEMENT on penalty clear
  IF NEW.penalty_status = 'cleared' AND OLD.penalty_status = 'pending' THEN
    IF NEW.proof_km IS NULL OR NEW.proof_km <= 0 THEN
      RAISE EXCEPTION 'BLOCKED: Cannot clear penalty without KM proof. Slip ID: %', OLD.id;
    END IF;
    IF OLD.category = 'brahmacharya_gate' AND NEW.proof_km < 50 THEN
      RAISE EXCEPTION 'BLOCKED: Brahmacharya requires min 50km. Got: %. Slip ID: %', NEW.proof_km, OLD.id;
    END IF;
    IF OLD.category != 'brahmacharya_gate' AND NEW.proof_km < 20 THEN
      RAISE EXCEPTION 'BLOCKED: Penalty requires min 20km. Got: %. Slip ID: %', NEW.proof_km, OLD.id;
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

-- Verify
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'slips' AND table_schema = 'public' ORDER BY ordinal_position;
SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'public.slips'::regclass AND tgname NOT LIKE 'RI_%';
SELECT 'HOTFIX APPLIED — penalty column added, triggers active' AS status;
