-- ============================================================================
-- FirstLight — Cross-Device Sync Tables
-- Supabase Project: edgnudrbysybefbqyijq.supabase.co
-- Created: 2026-04-19
-- ============================================================================
--
-- IMPORTANT: After running this SQL, enable Realtime replication in the
-- Supabase Dashboard (Database > Replication) for ALL 13 tables:
--
--   NEW TABLES:        rituals_log, deepwork_log, mastery_log, gym_workouts,
--                      brahma_log, journal_entries, ekadashi_log, weekly_schedule
--
--   EXISTING TABLES:   proof_archive, slips, daily_checkin, reading_log, races
--
-- Dashboard path: Settings > Database > Replication > supabase_realtime
-- Toggle ON each table listed above.
-- ============================================================================


-- ============================================================================
-- 1. REUSABLE TRIGGER FUNCTION — auto-update updated_at on every row change
-- ============================================================================

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 2. NEW SYNC TABLES
-- ============================================================================

-- 2a. rituals_log — Replaces localStorage key fl_rituals_{period}_{date}
CREATE TABLE IF NOT EXISTS rituals_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('morning', 'midday', 'evening')),
  completed_ids JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, period)
);

-- 2b. deepwork_log — Replaces fl_deepwork_{date}
CREATE TABLE IF NOT EXISTS deepwork_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  blocks JSONB DEFAULT '[]',
  big_win TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2c. mastery_log — Replaces fl_mastery_daily_{date}
CREATE TABLE IF NOT EXISTS mastery_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  items JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2d. gym_workouts — Replaces fl_gym_{date}
CREATE TABLE IF NOT EXISTS gym_workouts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  split TEXT DEFAULT '',
  exercises JSONB DEFAULT '[]',
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2e. brahma_log — Replaces fl_brahma_daily_{date}
CREATE TABLE IF NOT EXISTS brahma_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2f. journal_entries — Replaces fl_journal object
CREATE TABLE IF NOT EXISTS journal_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  entry JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2g. ekadashi_log — Replaces fl_ekadashi_{date}
CREATE TABLE IF NOT EXISTS ekadashi_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  status TEXT DEFAULT '',
  note TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2h. weekly_schedule — Replaces fl_weekly_{weekKey}
CREATE TABLE IF NOT EXISTS weekly_schedule (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  week_key TEXT NOT NULL UNIQUE,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- 3. ADD updated_at TO EXISTING TABLES (safe — skips if column already exists)
-- ============================================================================

DO $$
BEGIN
  -- proof_archive
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proof_archive' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE proof_archive ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- slips
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'slips' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE slips ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- daily_checkin
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_checkin' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE daily_checkin ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- reading_log
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reading_log' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE reading_log ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- races
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'races' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE races ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;


-- ============================================================================
-- 4. AUTO-UPDATE TRIGGERS — apply update_timestamp() to all 13 tables
-- ============================================================================

-- New tables (8)
DROP TRIGGER IF EXISTS trg_rituals_log_updated_at ON rituals_log;
CREATE TRIGGER trg_rituals_log_updated_at
  BEFORE UPDATE ON rituals_log
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_deepwork_log_updated_at ON deepwork_log;
CREATE TRIGGER trg_deepwork_log_updated_at
  BEFORE UPDATE ON deepwork_log
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_mastery_log_updated_at ON mastery_log;
CREATE TRIGGER trg_mastery_log_updated_at
  BEFORE UPDATE ON mastery_log
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_gym_workouts_updated_at ON gym_workouts;
CREATE TRIGGER trg_gym_workouts_updated_at
  BEFORE UPDATE ON gym_workouts
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_brahma_log_updated_at ON brahma_log;
CREATE TRIGGER trg_brahma_log_updated_at
  BEFORE UPDATE ON brahma_log
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_journal_entries_updated_at ON journal_entries;
CREATE TRIGGER trg_journal_entries_updated_at
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_ekadashi_log_updated_at ON ekadashi_log;
CREATE TRIGGER trg_ekadashi_log_updated_at
  BEFORE UPDATE ON ekadashi_log
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_weekly_schedule_updated_at ON weekly_schedule;
CREATE TRIGGER trg_weekly_schedule_updated_at
  BEFORE UPDATE ON weekly_schedule
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Existing tables (5)
DROP TRIGGER IF EXISTS trg_proof_archive_updated_at ON proof_archive;
CREATE TRIGGER trg_proof_archive_updated_at
  BEFORE UPDATE ON proof_archive
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_slips_updated_at ON slips;
CREATE TRIGGER trg_slips_updated_at
  BEFORE UPDATE ON slips
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_daily_checkin_updated_at ON daily_checkin;
CREATE TRIGGER trg_daily_checkin_updated_at
  BEFORE UPDATE ON daily_checkin
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_reading_log_updated_at ON reading_log;
CREATE TRIGGER trg_reading_log_updated_at
  BEFORE UPDATE ON reading_log
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_races_updated_at ON races;
CREATE TRIGGER trg_races_updated_at
  BEFORE UPDATE ON races
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();


-- ============================================================================
-- 5. ENABLE ROW LEVEL SECURITY on all 8 new tables
-- ============================================================================

ALTER TABLE rituals_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE deepwork_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mastery_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE brahma_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ekadashi_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_schedule ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 6. RLS POLICIES — authenticated SELECT, INSERT, UPDATE only (no DELETE)
-- ============================================================================

-- rituals_log
CREATE POLICY "rituals_log_select" ON rituals_log
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rituals_log_insert" ON rituals_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "rituals_log_update" ON rituals_log
  FOR UPDATE USING (auth.role() = 'authenticated');

-- deepwork_log
CREATE POLICY "deepwork_log_select" ON deepwork_log
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "deepwork_log_insert" ON deepwork_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "deepwork_log_update" ON deepwork_log
  FOR UPDATE USING (auth.role() = 'authenticated');

-- mastery_log
CREATE POLICY "mastery_log_select" ON mastery_log
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "mastery_log_insert" ON mastery_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "mastery_log_update" ON mastery_log
  FOR UPDATE USING (auth.role() = 'authenticated');

-- gym_workouts
CREATE POLICY "gym_workouts_select" ON gym_workouts
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "gym_workouts_insert" ON gym_workouts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "gym_workouts_update" ON gym_workouts
  FOR UPDATE USING (auth.role() = 'authenticated');

-- brahma_log
CREATE POLICY "brahma_log_select" ON brahma_log
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "brahma_log_insert" ON brahma_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "brahma_log_update" ON brahma_log
  FOR UPDATE USING (auth.role() = 'authenticated');

-- journal_entries
CREATE POLICY "journal_entries_select" ON journal_entries
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "journal_entries_insert" ON journal_entries
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "journal_entries_update" ON journal_entries
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ekadashi_log
CREATE POLICY "ekadashi_log_select" ON ekadashi_log
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "ekadashi_log_insert" ON ekadashi_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "ekadashi_log_update" ON ekadashi_log
  FOR UPDATE USING (auth.role() = 'authenticated');

-- weekly_schedule
CREATE POLICY "weekly_schedule_select" ON weekly_schedule
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "weekly_schedule_insert" ON weekly_schedule
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "weekly_schedule_update" ON weekly_schedule
  FOR UPDATE USING (auth.role() = 'authenticated');


-- ============================================================================
-- DONE. Next steps:
-- 1. Run this SQL in Supabase SQL Editor
-- 2. Enable Realtime for all 13 tables in Dashboard > Database > Replication
-- 3. Update JS modules to use supabase.from('table').upsert() instead of
--    localStorage.setItem()
-- ============================================================================
