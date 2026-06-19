-- ═══════════════════════════════════════════════════════════════════════════
-- FIRST LIGHT — Accountability Engine Schema Additions
-- Adds 3 optional columns to existing tables. All idempotent (IF NOT EXISTS).
-- Run in: Supabase Dashboard → SQL Editor (project edgnudrbysybefbqyijq)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── slips: monetary forfeit fields ──
ALTER TABLE public.slips ADD COLUMN IF NOT EXISTS penalty_amount   INTEGER;
ALTER TABLE public.slips ADD COLUMN IF NOT EXISTS penalty_charity  TEXT;
ALTER TABLE public.slips ADD COLUMN IF NOT EXISTS ig_post_id       TEXT;

-- ── proof_archive: engine verdict tracking ──
ALTER TABLE public.proof_archive ADD COLUMN IF NOT EXISTS verdict       TEXT;  -- 'WIN' | 'MISS' | 'PENDING'
ALTER TABLE public.proof_archive ADD COLUMN IF NOT EXISTS activity_type TEXT;  -- Strava type
ALTER TABLE public.proof_archive ADD COLUMN IF NOT EXISTS activity_name TEXT;  -- Strava name
ALTER TABLE public.proof_archive ADD COLUMN IF NOT EXISTS ig_post_id    TEXT;  -- IG media_id

-- Helpful index for "today's verdict already published?" idempotency check
CREATE INDEX IF NOT EXISTS proof_archive_date_idx ON public.proof_archive (date);

-- ── secrets: 3 new keys the engine needs ──
-- INSERT these manually via the dashboard, NOT via this file (rotation pattern):
--   render_worker_base   — e.g. 'https://firstlight.live' (or 'https://firstlight.firstlightlive.workers.dev')
--   render_worker_key    — shared secret between Edge Fn and CF Worker (optional but recommended)
--   akshaya_upi_link     — e.g. 'upi://pay?pa=donate@akshayapatra&pn=Akshaya%20Patra&am=1500'

-- ── VERIFY ──
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'slips' AND column_name IN ('penalty_amount','penalty_charity','ig_post_id')
ORDER BY column_name;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'proof_archive' AND column_name IN ('verdict','activity_type','activity_name','ig_post_id')
ORDER BY column_name;
