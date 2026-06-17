-- ═══════════════════════════════════════════════════════
-- FIRST LIGHT — Missing Tables (run this to catch up)
-- These 4 tables were added after the initial schema run
-- Safe to run multiple times (IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════

-- 23. ARCHIVE LOG — tracks GCS archival runs
CREATE TABLE IF NOT EXISTS archive_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  archive_date DATE NOT NULL,
  tables_archived INTEGER DEFAULT 0,
  rows_archived INTEGER DEFAULT 0,
  gcs_path TEXT,
  status TEXT CHECK (status IN ('success', 'partial', 'failed')),
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archive_log_date ON archive_log(archive_date DESC);
ALTER TABLE archive_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON archive_log FOR ALL USING (true) WITH CHECK (true);

-- 24. VOICE ENTRIES — audio journal with transcripts
CREATE TABLE IF NOT EXISTS voice_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_seconds INTEGER DEFAULT 0,
  transcript TEXT,
  emotional_intensity INTEGER DEFAULT 0,
  mood TEXT,
  tags JSONB DEFAULT '[]',
  audio_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_date ON voice_entries(date);
CREATE INDEX IF NOT EXISTS idx_voice_intensity ON voice_entries(emotional_intensity DESC);
ALTER TABLE voice_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON voice_entries FOR ALL USING (true) WITH CHECK (true);

-- 25. GYM WORKOUTS — one row per workout session
CREATE TABLE IF NOT EXISTS gym_workouts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  split TEXT CHECK (split IN ('push','pull','legs','upper','lower','full','cardio','functional','rest')),
  duration_minutes INTEGER DEFAULT 0,
  energy_level INTEGER DEFAULT 0,
  notes TEXT,
  exercises JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gym_workouts_date ON gym_workouts(date);
ALTER TABLE gym_workouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON gym_workouts FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER tr_gym_workouts_updated BEFORE UPDATE ON gym_workouts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 26. GYM SETS — individual sets within a workout
CREATE TABLE IF NOT EXISTS gym_sets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workout_date DATE NOT NULL,
  exercise TEXT NOT NULL,
  muscle_group TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  weight_kg NUMERIC(5,1) DEFAULT 0,
  reps INTEGER DEFAULT 0,
  is_pr BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gym_sets_date ON gym_sets(workout_date);
CREATE INDEX IF NOT EXISTS idx_gym_sets_exercise ON gym_sets(exercise);
ALTER TABLE gym_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON gym_sets FOR ALL USING (true) WITH CHECK (true);
