-- ═══════════════════════════════════════════════════════
-- FIRSTLIGHT LIFE OS V1 — NEW SQL
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- Safe to re-run (all IF NOT EXISTS / DROP IF EXISTS)
-- ═══════════════════════════════════════════════════════


-- ─── FIX: Add 'midday' to daily_rituals period constraint ───
ALTER TABLE daily_rituals DROP CONSTRAINT IF EXISTS daily_rituals_period_check;
ALTER TABLE daily_rituals ADD CONSTRAINT daily_rituals_period_check
  CHECK (period IN ('morning', 'midday', 'evening', 'weekly', 'monthly'));


-- ─── TABLE 28: DAILY CHECKIN (unified day seal) ───
CREATE TABLE IF NOT EXISTS daily_checkin (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  morning_pct INTEGER DEFAULT 0,
  midday_pct INTEGER DEFAULT 0,
  evening_pct INTEGER DEFAULT 0,
  gym_done BOOLEAN DEFAULT FALSE,
  deep_work_blocks INTEGER DEFAULT 0,
  mastery_pct INTEGER DEFAULT 0,
  reading_done BOOLEAN DEFAULT FALSE,
  food_clean BOOLEAN DEFAULT TRUE,
  food_violation TEXT,
  wake_time TEXT,
  lights_out TEXT,
  fortress_stayed_out BOOLEAN,
  device_free BOOLEAN,
  brahma_clean BOOLEAN,
  urge INTEGER DEFAULT 0,
  mood INTEGER DEFAULT 5,
  energy INTEGER DEFAULT 5,
  journal_note TEXT,
  sealed BOOLEAN DEFAULT FALSE,
  sealed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE daily_checkin ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON daily_checkin;
CREATE POLICY "Allow all for anon" ON daily_checkin FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS tr_daily_checkin_updated ON daily_checkin;
CREATE TRIGGER tr_daily_checkin_updated BEFORE UPDATE ON daily_checkin
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─── TABLE 29: READING LOG ───
CREATE TABLE IF NOT EXISTS reading_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  type TEXT NOT NULL DEFAULT 'daily_rule' CHECK (type IN ('daily_rule', 'full_25')),
  rule_number INTEGER,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, type)
);

ALTER TABLE reading_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON reading_log;
CREATE POLICY "Allow all for anon" ON reading_log FOR ALL USING (true) WITH CHECK (true);


-- ─── TABLE 30: SLIPS (immutable accountability) ───
CREATE TABLE IF NOT EXISTS slips (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  rule TEXT NOT NULL CHECK (rule IN ('body', 'fortress', 'sadhana')),
  category TEXT NOT NULL,
  description TEXT,
  function_met TEXT NOT NULL,
  upstream_gap TEXT NOT NULL,
  insight TEXT NOT NULL,
  architectural_state JSONB DEFAULT '{}',
  penalty_km INTEGER DEFAULT 20,
  penalty_status TEXT DEFAULT 'pending' CHECK (penalty_status IN ('pending', 'cleared', 'in_progress')),
  proof_url TEXT,
  proof_km NUMERIC(5,1),
  proof_strava_url TEXT,
  cleared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE slips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read slips" ON slips;
CREATE POLICY "Public read slips" ON slips FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin insert slips" ON slips;
CREATE POLICY "Admin insert slips" ON slips FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Admin update penalty" ON slips;
CREATE POLICY "Admin update penalty" ON slips FOR UPDATE USING (true) WITH CHECK (true);
-- Explicitly deny DELETE at policy level (trigger is backup)
DROP POLICY IF EXISTS "No delete slips" ON slips;
CREATE POLICY "No delete slips" ON slips FOR DELETE USING (false);

-- SLIP IMMUTABILITY: prevent ALL deletions
CREATE OR REPLACE FUNCTION prevent_slip_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'SLIPS ARE PERMANENT: Deletion is not permitted. This is an immutable accountability record.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS no_delete_slips ON slips;
CREATE TRIGGER no_delete_slips BEFORE DELETE ON slips
  FOR EACH ROW EXECUTE FUNCTION prevent_slip_delete();

-- SLIP IMMUTABILITY: restrict updates to penalty fields only
CREATE OR REPLACE FUNCTION restrict_slip_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.date IS DISTINCT FROM NEW.date OR
     OLD.rule IS DISTINCT FROM NEW.rule OR
     OLD.category IS DISTINCT FROM NEW.category OR
     OLD.function_met IS DISTINCT FROM NEW.function_met OR
     OLD.upstream_gap IS DISTINCT FROM NEW.upstream_gap OR
     OLD.insight IS DISTINCT FROM NEW.insight OR
     OLD.description IS DISTINCT FROM NEW.description OR
     OLD.architectural_state IS DISTINCT FROM NEW.architectural_state THEN
    RAISE EXCEPTION 'SLIP CORE FIELDS ARE IMMUTABLE: Only penalty status and proof can be updated.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS restrict_slip_fields ON slips;
CREATE TRIGGER restrict_slip_fields BEFORE UPDATE ON slips
  FOR EACH ROW EXECUTE FUNCTION restrict_slip_update();


-- ─── TABLE 31: ARCHITECTURE LOG ───
CREATE TABLE IF NOT EXISTS architecture_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  slip_id BIGINT REFERENCES slips(id),
  observation TEXT NOT NULL,
  hypothesis TEXT,
  proposed_change TEXT,
  tags JSONB DEFAULT '[]',
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'testing', 'confirmed', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE architecture_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON architecture_log;
CREATE POLICY "Allow all for anon" ON architecture_log FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS tr_arch_log_updated ON architecture_log;
CREATE TRIGGER tr_arch_log_updated BEFORE UPDATE ON architecture_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─── TABLE: EKADASHI LOG (if not already created) ───
CREATE TABLE IF NOT EXISTS ekadashi_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  date DATE NOT NULL UNIQUE,
  ekadashi_name TEXT NOT NULL,
  paksha TEXT CHECK (paksha IN ('shukla', 'krishna')),
  status TEXT CHECK (status IN ('observed', 'missed', 'partial')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ekadashi_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner access" ON ekadashi_log;
CREATE POLICY "Owner access" ON ekadashi_log FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- ═══════════════════════════════════════════════════════
-- HISTORY LOCK — UPDATED WITH 3-HOUR GRACE WINDOW
-- Lock time: 3:00 AM IST. Before 3 AM, yesterday is still editable.
-- Race day exception: +1 additional day grace.
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_history_lock()
RETURNS TRIGGER AS $$
DECLARE
  target_date DATE;
  has_race BOOLEAN := FALSE;
  effective_today DATE;
BEGIN
  -- Extract the date from the row
  IF TG_ARGV[0] = 'date' THEN
    target_date := NEW.date;
  ELSIF TG_ARGV[0] = 'week_date' THEN
    target_date := NEW.week_date + INTERVAL '6 days';
  ELSIF TG_ARGV[0] = 'week_start' THEN
    target_date := NEW.week_start + INTERVAL '6 days';
  ELSIF TG_ARGV[0] = 'month' THEN
    target_date := (NEW.month || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day';
  ELSE
    RETURN NEW;
  END IF;

  -- 3-hour grace: before 3:00 AM IST, yesterday is still editable
  IF EXTRACT(HOUR FROM current_timestamp AT TIME ZONE 'Asia/Kolkata') < 3 THEN
    effective_today := (current_timestamp AT TIME ZONE 'Asia/Kolkata')::DATE - INTERVAL '1 day';
  ELSE
    effective_today := (current_timestamp AT TIME ZONE 'Asia/Kolkata')::DATE;
  END IF;

  -- Today or future = always allow
  IF target_date >= effective_today THEN
    RETURN NEW;
  END IF;

  -- Race day grace: +1 day
  IF TG_ARGV[0] = 'date' THEN
    SELECT EXISTS(SELECT 1 FROM races WHERE races.date = NEW.date) INTO has_race;
    IF has_race AND target_date >= (effective_today - INTERVAL '1 day') THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'HISTORY LOCKED: Cannot modify data for % — sealed permanently.', target_date;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;


-- ─── APPLY HISTORY LOCK TO ALL TABLES ───

DROP TRIGGER IF EXISTS history_lock ON daily_rituals;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON daily_rituals
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('date');

DROP TRIGGER IF EXISTS history_lock ON journal_entries;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('date');

DROP TRIGGER IF EXISTS history_lock ON daily_logs;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON daily_logs
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('date');

DROP TRIGGER IF EXISTS history_lock ON deep_work_sessions;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON deep_work_sessions
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('date');

DROP TRIGGER IF EXISTS history_lock ON gym_workouts;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON gym_workouts
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('date');

DROP TRIGGER IF EXISTS history_lock ON mastery_daily;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON mastery_daily
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('date');

DROP TRIGGER IF EXISTS history_lock ON brahma_daily;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON brahma_daily
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('date');

DROP TRIGGER IF EXISTS history_lock ON ekadashi_log;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON ekadashi_log
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('date');

DROP TRIGGER IF EXISTS history_lock ON engagement_counters;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON engagement_counters
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('date');

DROP TRIGGER IF EXISTS history_lock ON voice_entries;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON voice_entries
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('date');

DROP TRIGGER IF EXISTS history_lock ON daily_checkin;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON daily_checkin
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('date');

DROP TRIGGER IF EXISTS history_lock ON reading_log;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON reading_log
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('date');

DROP TRIGGER IF EXISTS history_lock ON mastery_weekly;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON mastery_weekly
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('week_date');

DROP TRIGGER IF EXISTS history_lock ON brahma_weekly;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON brahma_weekly
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('week_date');

DROP TRIGGER IF EXISTS history_lock ON weekly_metrics;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON weekly_metrics
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('week_date');

DROP TRIGGER IF EXISTS history_lock ON weekly_schedule;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON weekly_schedule
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('week_start');

DROP TRIGGER IF EXISTS history_lock ON monthly_grids;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON monthly_grids
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('month');

DROP TRIGGER IF EXISTS history_lock ON mastery_monthly_scores;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON mastery_monthly_scores
  FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('month');
