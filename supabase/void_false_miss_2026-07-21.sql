-- ─────────────────────────────────────────────────────────────
-- VOID FALSE-MISS SLIP — 2026-07-21 (Chapter 03, Day 3)
-- ─────────────────────────────────────────────────────────────
-- Context: the Afternoon Walk (5.04 km, activity 19407716400) synced to
-- Strava AFTER the nightly verdict (23:50 IST) and the 00:15 grace re-check
-- had already run, so Day 3 was recorded as a MISS and slip id=32
-- (engine_miss_2026-07-21, ₹1,500 → Akshaya Patra) was booked.
--
-- The walk was later synced, the verdict was correctly revised MISS→WIN, and
-- the WIN was published to Instagram (proof_archive.ig_post_id = 18209934496355648).
-- But grace's auto-retraction of the slip FAILED silently: the
-- enforce_slip_immutability trigger (a) freezes `insight` once set and
-- (b) refuses to clear an auto_forfeit/charity_donation slip without a
-- proof_url receipt. A false miss has no receipt (nothing was owed), so the
-- slip is stuck 'pending' and the Receipts panel nags for a ₹1,500 payment on
-- a day that was actually a WIN.
--
-- This voids that phantom slip. Run in the Supabase SQL editor (postgres role
-- owns the table and can toggle the trigger). Idempotent + guarded to id 32.

BEGIN;

ALTER TABLE public.slips DISABLE TRIGGER enforce_slip_immutability;

UPDATE public.slips
   SET penalty_status = 'cleared',
       penalty_amount = 0,
       insight = insight || ' · VOIDED: false miss — Afternoon Walk 5.04km synced late, verdict revised MISS→WIN, IG post 18209934496355648.'
 WHERE id = 32
   AND client_id = 'engine_miss_2026-07-21'
   AND penalty_status = 'pending';

ALTER TABLE public.slips ENABLE TRIGGER enforce_slip_immutability;

COMMIT;

-- Verify:
-- SELECT id, date, penalty_status, penalty_amount, insight FROM public.slips WHERE id = 32;
