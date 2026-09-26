-- ═══════════════════════════════════════════════════════════════
-- DISCIPLINE LOG — the 5 rituals + the Punishment Cycle ledger
-- Added 2026-09-26. Apply once in the SQL editor (edgnudrbysybefbqyijq).
--
-- WHY: discipline.html kept EVERYTHING in localStorage only —
--   fl_ch4_log            every day's ritual marks + penance owed
--   fl_ch6_cleared_<date> cumulative km paid against that penance
-- One device, no backup, no sync. Clear the browser and the entire covenant
-- record and debt ledger are gone. rituals_log has not grown since 2026-07-23
-- precisely because the daily flow moved to this page when Chapter 04 opened.
-- Same class of bug the food log had before today.
--
-- ONE table, two kinds of row, because they are the same ledger:
--   kind='day'      one row per date — the marks and the penance that day owes
--   kind='cleared'  one row per run  — cumulative km paid (date = the run epoch)
--
-- Shape is JSONB per the CLAUDE.md rule: the ritual set changes between
-- chapters, and a column-per-ritual would need a migration every time.
--
-- PRIVATE. Granted to `authenticated` only, anon revoked — this is the covenant
-- record, not public proof. Idempotent; safe to re-run.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.discipline_log (
  date        date NOT NULL,
  kind        text NOT NULL DEFAULT 'day',    -- 'day' | 'cleared'
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  device_id   text,
  PRIMARY KEY (date, kind)
);

CREATE INDEX IF NOT EXISTS discipline_log_date_idx ON public.discipline_log (date DESC);

ALTER TABLE public.discipline_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS open_access ON public.discipline_log;
CREATE POLICY open_access ON public.discipline_log
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discipline_log TO authenticated;
REVOKE ALL ON public.discipline_log FROM anon;

-- NO history-lock trigger here, deliberately. The other daily tables lock the
-- past, but this page legitimately re-logs today and records a payment against
-- an OLDER day's debt. Locking it would make the ledger unpayable.

-- Realtime, so the phone and the laptop agree without a reload. Never allowed to
-- roll back the table — see food_log.sql for why this is WHEN OTHERS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='discipline_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.discipline_log;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'skipping realtime for discipline_log: %', SQLERRM;
END $$;

ALTER TABLE public.discipline_log REPLICA IDENTITY FULL;

COMMIT;

-- ── VERIFY ──
SELECT policyname, roles::text, cmd FROM pg_policies
 WHERE schemaname='public' AND tablename='discipline_log';   -- expect {authenticated} ALL
SELECT kind, count(*) AS rows_, min(date) AS oldest, max(date) AS newest
  FROM public.discipline_log GROUP BY kind;
