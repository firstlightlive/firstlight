-- ═══════════════════════════════════════════════════════════════
-- FOOD LOG — lifetime meal record (added 2026-09-26)
--
-- WHY: admin-food.js kept every scanned meal in localStorage ONLY, capped at
-- 500 entries, and the panel rendered today only. That is a cache, not a
-- record: clear the browser, switch phones, or log meal 501 and the earliest
-- history is gone. The food log is meant to run for life, so it needs a real
-- table. localStorage stays as the offline cache; this table is the truth.
--
-- PRIVATE BY DEFAULT. Food photos and calorie history are personal data, so
-- the policy is granted to `authenticated` only — NOT anon. This matches the
-- private-table rule in CLAUDE.md (brahma, journal, checkin, mastery, rituals)
-- and is why the log does NOT live in the `config` table, which allows anon
-- SELECT and would publish every meal.
--
-- NO CAP, NO PRUNE, NO RETENTION WINDOW. Nothing in here deletes by age.
--
-- Schema note: only `date` is a real column (it is what every query filters
-- and orders by). Everything the analyser returns lives in `data` JSONB, per
-- the CLAUDE.md rule to use JSONB for flexibility rather than reshaping
-- columns later when the scanner's output changes.
--
-- APPLY: paste into the Supabase SQL editor for project edgnudrbysybefbqyijq
-- and run. Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.food_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date        date NOT NULL,                       -- IST calendar day of the meal
  logged_at   timestamptz NOT NULL DEFAULT now(),
  meal_time   text,                                -- 'HH:MM' IST, as shown in the UI
  source      text NOT NULL DEFAULT 'scan',        -- 'scan' (Gemini) | 'manual' (offline, no AI)
  photo_url   text,                                -- may be null: manual entry, or upload failed
  verdict     text,                                -- CLEAN | VIOLATION | NO_FOOD | UNREVIEWED
  calories    numeric,                             -- denormalised from data->'total' for fast sums
  summary     text,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- items[], total{}, violations[], health_score
  device_id   text,                                -- which install wrote it (LWW tiebreak)
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- History reads are always "newest first, by day".
CREATE INDEX IF NOT EXISTS food_log_date_idx      ON public.food_log (date DESC);
CREATE INDEX IF NOT EXISTS food_log_logged_at_idx ON public.food_log (logged_at DESC);

-- Offline replay safety: the client mints the uuid, so a queued write that
-- replays twice must not create a duplicate meal. id is the PK, so an upsert
-- on id is idempotent — that is what admin-food.js sends (Prefer: resolution=
-- merge-duplicates).

ALTER TABLE public.food_log ENABLE ROW LEVEL SECURITY;

-- Owner-only. anon gets NOTHING: no select, no insert.
DROP POLICY IF EXISTS open_access ON public.food_log;
CREATE POLICY open_access ON public.food_log
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.food_log TO authenticated;
REVOKE ALL ON public.food_log FROM anon;

-- ── REALTIME ────────────────────────────────────────────────────
-- Cross-DEVICE sync. fl-offline.js holds a Realtime socket and re-renders every
-- open surface when a row lands, but a table absent from this publication never
-- emits, so the socket looks alive and stays permanently silent. RLS still
-- applies to the stream, which is why the client joins with the owner JWT
-- rather than the anon key.
-- (Cross-TAB sync does not depend on this — that runs over BroadcastChannel.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'food_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.food_log;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Realtime is an enhancement, never a reason to lose the table. This also
  -- covers a publication declared FOR ALL TABLES (where ADD TABLE errors) and
  -- any privilege problem. Cross-TAB sync does not depend on this at all, and
  -- cross-DEVICE sync still catches up on the hourly prefetch and on page load.
  RAISE NOTICE 'skipping realtime for food_log: %', SQLERRM;
END $$;

-- Realtime sends the full row on UPDATE only with REPLICA IDENTITY FULL.
ALTER TABLE public.food_log REPLICA IDENTITY FULL;

COMMIT;

-- Verify:
--   SELECT tablename FROM pg_publication_tables
--    WHERE pubname='supabase_realtime' AND tablename='food_log';   -- expect 1 row
--
--   SELECT policyname, roles::text, cmd FROM pg_policies
--    WHERE schemaname='public' AND tablename='food_log';
--   -- expect exactly one row: open_access | {authenticated} | ALL
--
--   SELECT count(*), min(date), max(date) FROM public.food_log;
