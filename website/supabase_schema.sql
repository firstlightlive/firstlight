-- ═══════════════════════════════════════════════════════
-- FIRST LIGHT — Supabase Database Schema
-- Designed for 20-30 year data persistence
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════

-- AUTO-UPDATE FUNCTION (must be created first — referenced by all triggers)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. DAILY RITUALS — morning/evening checklist completion
CREATE TABLE IF NOT EXISTS daily_rituals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('morning', 'midday', 'evening')),
  done_indices JSONB NOT NULL DEFAULT '[]',
  total_items INTEGER DEFAULT 0,
  completion_pct INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, period)
);

-- 2. JOURNAL ENTRIES — daily reflections, thoughts, diary
CREATE TABLE IF NOT EXISTS journal_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  aligned TEXT,
  not_aligned TEXT,
  wins TEXT,
  changes TEXT,
  improve TEXT,
  mood TEXT,
  energy INTEGER,
  thoughts TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. DAILY LOGS — seal the day data (sleep, run, gym, food)
CREATE TABLE IF NOT EXISTS daily_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  wake_time TEXT,
  sleep_hrs NUMERIC(3,1),
  run_km NUMERIC(5,2),
  run_start TEXT,
  run_pace TEXT,
  gym BOOLEAN DEFAULT FALSE,
  muscle TEXT,
  food_clean BOOLEAN DEFAULT TRUE,
  violation TEXT,
  brahma BOOLEAN DEFAULT FALSE,
  japa BOOLEAN DEFAULT FALSE,
  nasya BOOLEAN DEFAULT FALSE,
  breach BOOLEAN DEFAULT FALSE,
  mood INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RACES — marathon/race portfolio
CREATE TABLE IF NOT EXISTS races (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  date DATE NOT NULL,
  location TEXT,
  country TEXT,
  type TEXT CHECK (type IN ('5k', '10k', 'half', 'marathon', 'ultra50k', 'ultra100k', 'other')),
  distance NUMERIC(6,3),
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('completed', 'upcoming', 'dns', 'dnf')),
  bib TEXT,
  bib_photo TEXT,
  finish_time TEXT,
  finish_time_sec INTEGER,
  gun_time TEXT,
  pace TEXT,
  target_time TEXT,
  position JSONB DEFAULT '{}',
  splits JSONB DEFAULT '[]',
  conditions JSONB DEFAULT '{}',
  heart_rate JSONB DEFAULT '{}',
  calories INTEGER,
  photos JSONB DEFAULT '[]',
  videos JSONB DEFAULT '[]',
  strava_url TEXT,
  official_results_url TEXT,
  notes TEXT,
  highlight TEXT,
  tags JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. WEEKLY METRICS — instagram/engagement tracking
CREATE TABLE IF NOT EXISTS weekly_metrics (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  week_date DATE NOT NULL UNIQUE,
  saves INTEGER,
  shares INTEGER,
  visits INTEGER,
  reach INTEGER,
  completion INTEGER,
  growth INTEGER,
  story_eng INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. MONTHLY GRIDS — ritual tracker grids (the PDF-style tracker)
CREATE TABLE IF NOT EXISTS monthly_grids (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  month TEXT NOT NULL UNIQUE, -- format: YYYY-MM
  grid_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. DEEP WORK SESSIONS — daily focus blocks
CREATE TABLE IF NOT EXISTS deep_work_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  blocks JSONB NOT NULL DEFAULT '[]',
  total_sessions INTEGER DEFAULT 0,
  total_hours NUMERIC(4,1) DEFAULT 0,
  biggest_win TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ENGAGEMENT COUNTERS — daily community engagement
CREATE TABLE IF NOT EXISTS engagement_counters (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  comments INTEGER DEFAULT 0,
  stories INTEGER DEFAULT 0,
  dms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. CONFIG — site-wide settings (key-value)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. RITUAL DEFINITIONS — the actual ritual items (survives reordering)
-- Each ritual has a stable ID so completion data always maps correctly
CREATE TABLE IF NOT EXISTS ritual_definitions (
  id TEXT PRIMARY KEY,                  -- stable ID e.g. "morning_alarm", "evening_nasya"
  period TEXT NOT NULL CHECK (period IN ('morning', 'midday', 'evening')),
  block TEXT NOT NULL,                  -- time block e.g. "WAKE", "BRAHMA_MUHURTA"
  sort_order INTEGER NOT NULL DEFAULT 0,
  time_label TEXT,                      -- e.g. "3:15 AM"
  title TEXT NOT NULL,                  -- short name
  description TEXT,                     -- detailed explanation (WHY + HOW)
  category TEXT CHECK (category IN ('SACRED','AYUR','BIOHACK','FUEL','MIND','MOVE','SKIN','SLEEP')),
  active BOOLEAN DEFAULT TRUE,          -- soft delete — never lose history
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. RITUAL COMPLETIONS — links to ritual_definitions by stable ID
-- This replaces the index-based system with an ID-based system
CREATE TABLE IF NOT EXISTS ritual_completions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  ritual_id TEXT NOT NULL REFERENCES ritual_definitions(id),
  completed BOOLEAN DEFAULT TRUE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, ritual_id)
);

-- 12. STORIES COMPLETIONS — daily stories checklist
CREATE TABLE IF NOT EXISTS stories_completions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  done_indices JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. WEEKLY SCHEDULE — day-specific tasks + commitments per week
CREATE TABLE IF NOT EXISTS weekly_schedule (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  week_start DATE NOT NULL UNIQUE, -- Monday of the week
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_schedule_date ON weekly_schedule(week_start);
ALTER TABLE weekly_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON weekly_schedule FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER tr_weekly_schedule_updated BEFORE UPDATE ON weekly_schedule FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_ritual_completions_date ON ritual_completions(date);
CREATE INDEX IF NOT EXISTS idx_ritual_defs_period ON ritual_definitions(period, sort_order);
CREATE INDEX IF NOT EXISTS idx_stories_date ON stories_completions(date);

ALTER TABLE ritual_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ritual_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon" ON ritual_definitions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON ritual_completions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON stories_completions FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER tr_ritual_defs_updated BEFORE UPDATE ON ritual_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════
-- INDEXES for fast queries over decades of data
-- ═══════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_rituals_date ON daily_rituals(date);
CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(date);
CREATE INDEX IF NOT EXISTS idx_logs_date ON daily_logs(date);
CREATE INDEX IF NOT EXISTS idx_races_date ON races(date);
CREATE INDEX IF NOT EXISTS idx_deep_work_date ON deep_work_sessions(date);
CREATE INDEX IF NOT EXISTS idx_engagement_date ON engagement_counters(date);

-- ═══════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — open for anon key (single user app)
-- ═══════════════════════════════════════════════════════
ALTER TABLE daily_rituals ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE races ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_grids ENABLE ROW LEVEL SECURITY;
ALTER TABLE deep_work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Allow all operations with anon key (this is a single-user personal app)
CREATE POLICY "Allow all for anon" ON daily_rituals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON journal_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON daily_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON races FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON weekly_metrics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON monthly_grids FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON deep_work_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON engagement_counters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON config FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════
-- TRIGGERS FOR ORIGINAL TABLES
-- ═══════════════════════════════════════════════════════
CREATE TRIGGER tr_rituals_updated BEFORE UPDATE ON daily_rituals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_journal_updated BEFORE UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_logs_updated BEFORE UPDATE ON daily_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_races_updated BEFORE UPDATE ON races FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_monthly_updated BEFORE UPDATE ON monthly_grids FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_deep_work_updated BEFORE UPDATE ON deep_work_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════
-- MASTERY TRACKER TABLES
-- ═══════════════════════════════════════════════════════

-- 14. MASTERY DAILY — 25-item daily mastery checklist
CREATE TABLE IF NOT EXISTS mastery_daily (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  items JSONB NOT NULL DEFAULT '{}',
  completed INTEGER DEFAULT 0,
  completion_pct INTEGER DEFAULT 0,
  domain_scores JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mastery_daily_date ON mastery_daily(date);
ALTER TABLE mastery_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON mastery_daily FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER tr_mastery_daily_updated BEFORE UPDATE ON mastery_daily FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 15. MASTERY WEEKLY — 7-item weekly review (Sunday date)
CREATE TABLE IF NOT EXISTS mastery_weekly (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  week_date DATE NOT NULL UNIQUE,
  items JSONB NOT NULL DEFAULT '{}',
  completed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mastery_weekly_date ON mastery_weekly(week_date);
ALTER TABLE mastery_weekly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON mastery_weekly FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER tr_mastery_weekly_updated BEFORE UPDATE ON mastery_weekly FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 16. MASTERY MONTHLY SCORES — aggregated monthly scorecard
CREATE TABLE IF NOT EXISTS mastery_monthly_scores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  month TEXT NOT NULL UNIQUE,
  daily_score INTEGER DEFAULT 0,
  daily_possible INTEGER DEFAULT 750,
  daily_pct INTEGER DEFAULT 0,
  weekly_score INTEGER DEFAULT 0,
  weekly_possible INTEGER DEFAULT 28,
  weekly_pct INTEGER DEFAULT 0,
  domain_breakdown JSONB DEFAULT '{}',
  prediction_total INTEGER DEFAULT 0,
  prediction_correct INTEGER DEFAULT 0,
  prediction_pct INTEGER DEFAULT 0,
  prediction_blind_spot TEXT,
  top_wins JSONB DEFAULT '[]',
  top_improvements JSONB DEFAULT '[]',
  key_insight TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mastery_monthly_month ON mastery_monthly_scores(month);
ALTER TABLE mastery_monthly_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON mastery_monthly_scores FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER tr_mastery_monthly_updated BEFORE UPDATE ON mastery_monthly_scores FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 17. MASTERY IDEAS — exploration & idea hub
CREATE TABLE IF NOT EXISTS mastery_ideas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_date DATE NOT NULL DEFAULT CURRENT_DATE,
  title TEXT NOT NULL,
  domain TEXT,
  category TEXT CHECK (category IN ('idea','research','experiment','reflection','resource')),
  content TEXT,
  tags JSONB DEFAULT '[]',
  status TEXT DEFAULT 'active' CHECK (status IN ('active','archived','in_progress','done')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mastery_ideas_date ON mastery_ideas(created_date);
CREATE INDEX IF NOT EXISTS idx_mastery_ideas_status ON mastery_ideas(status);
ALTER TABLE mastery_ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON mastery_ideas FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER tr_mastery_ideas_updated BEFORE UPDATE ON mastery_ideas FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════
-- BRAHMACHARYA FORTRESS TABLES
-- ═══════════════════════════════════════════════════════

-- 18. BRAHMA DAILY — sobriety daily check-in
CREATE TABLE IF NOT EXISTS brahma_daily (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  items JSONB NOT NULL DEFAULT '{}',
  is_clean BOOLEAN DEFAULT TRUE,
  urge_level INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brahma_daily_date ON brahma_daily(date);
ALTER TABLE brahma_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON brahma_daily FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER tr_brahma_daily_updated BEFORE UPDATE ON brahma_daily FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 19. BRAHMA WEEKLY — sobriety weekly review
CREATE TABLE IF NOT EXISTS brahma_weekly (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  week_date DATE NOT NULL UNIQUE,
  items JSONB NOT NULL DEFAULT '{}',
  clean_days INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brahma_weekly_date ON brahma_weekly(week_date);
ALTER TABLE brahma_weekly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON brahma_weekly FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER tr_brahma_weekly_updated BEFORE UPDATE ON brahma_weekly FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════
-- EXTEND RITUAL DEFINITIONS — support weekly/monthly periods
-- ═══════════════════════════════════════════════════════
ALTER TABLE ritual_definitions DROP CONSTRAINT IF EXISTS ritual_definitions_period_check;
ALTER TABLE ritual_definitions ADD CONSTRAINT ritual_definitions_period_check CHECK (period IN ('morning', 'evening', 'weekly', 'monthly'));
ALTER TABLE daily_rituals DROP CONSTRAINT IF EXISTS daily_rituals_period_check;
ALTER TABLE daily_rituals ADD CONSTRAINT daily_rituals_period_check CHECK (period IN ('morning', 'evening', 'weekly', 'monthly'));

-- ═══════════════════════════════════════════════════════
-- COMMUNITY COMMENT SYSTEM
-- ═══════════════════════════════════════════════════════

-- 20. COMMENTS — public visitor comments on streak
CREATE TABLE IF NOT EXISTS comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  parent_id BIGINT DEFAULT NULL,
  is_milestone BOOLEAN DEFAULT FALSE,
  milestone_day INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_milestone ON comments(is_milestone, milestone_day);
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read comments" ON comments FOR SELECT USING (true);
CREATE POLICY "Anyone can insert comments" ON comments FOR INSERT WITH CHECK (true);
CREATE TRIGGER tr_comments_updated BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 21. VISITOR IDENTITIES — private, never exposed via API
CREATE TABLE IF NOT EXISTS visitor_identities (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  mobile TEXT,
  upi_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE visitor_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can register" ON visitor_identities FOR INSERT WITH CHECK (true);

-- 22. COMMENT REACTIONS — per-visitor reaction tracking
CREATE TABLE IF NOT EXISTS comment_reactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  comment_id BIGINT NOT NULL REFERENCES comments(id),
  visitor_id TEXT NOT NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('fire','clap','strong','crown')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(comment_id, visitor_id)
);

ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read reactions" ON comment_reactions FOR SELECT USING (true);
CREATE POLICY "Anyone can react" ON comment_reactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can unreact" ON comment_reactions FOR DELETE USING (true);

-- ═══════════════════════════════════════════════════════
-- ARCHIVE LOG — tracks GCS archival runs
-- ═══════════════════════════════════════════════════════

-- 23. ARCHIVE LOG — daily GCS archival history
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

-- ═══════════════════════════════════════════════════════
-- VOICE JOURNAL ENTRIES
-- ═══════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════
-- GYM WORKOUT TRACKER
-- ═══════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════
-- EKADASHI TRACKER
-- ═══════════════════════════════════════════════════════

-- 27. EKADASHI LOG — fasting observance tracking
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

CREATE INDEX IF NOT EXISTS idx_ekadashi_log_date ON ekadashi_log(date);
ALTER TABLE ekadashi_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner access" ON ekadashi_log FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- ═══════════════════════════════════════════════════════
-- HISTORY LOCK — DATABASE ENFORCEMENT
-- Prevents INSERT or UPDATE on any row where the date column
-- is before today (current_date). This is the last line of defense.
-- Even direct API calls cannot modify historical data.
--
-- Race day exception: if a race exists for that date, allow +1 day grace.
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_history_lock()
RETURNS TRIGGER AS $$
DECLARE
  target_date DATE;
  has_race BOOLEAN := FALSE;
  effective_today DATE;
BEGIN
  -- Extract the date from the row (supports 'date', 'week_date', 'week_start')
  IF TG_ARGV[0] = 'date' THEN
    target_date := NEW.date;
  ELSIF TG_ARGV[0] = 'week_date' THEN
    target_date := NEW.week_date + INTERVAL '6 days';  -- Lock after full week ends
  ELSIF TG_ARGV[0] = 'week_start' THEN
    target_date := NEW.week_start + INTERVAL '6 days';
  ELSIF TG_ARGV[0] = 'month' THEN
    -- month column is TEXT 'YYYY-MM', lock after month ends
    target_date := (NEW.month || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day';
  ELSE
    RETURN NEW;  -- No date column to check
  END IF;

  -- 3-hour grace window: before 3:00 AM IST, yesterday is still editable
  -- This matches the user's schedule: wake 3:15 AM, data entry in car 7 AM and 8 PM
  IF EXTRACT(HOUR FROM current_timestamp AT TIME ZONE 'Asia/Kolkata') < 3 THEN
    effective_today := (current_timestamp AT TIME ZONE 'Asia/Kolkata')::DATE - INTERVAL '1 day';
  ELSE
    effective_today := (current_timestamp AT TIME ZONE 'Asia/Kolkata')::DATE;
  END IF;

  -- If the target date is today (with grace) or future, always allow
  IF target_date >= effective_today THEN
    RETURN NEW;
  END IF;

  -- Check for race day grace (+1 day beyond effective_today)
  IF TG_ARGV[0] = 'date' THEN
    SELECT EXISTS(SELECT 1 FROM races WHERE races.date = NEW.date) INTO has_race;
    IF has_race AND target_date >= (effective_today - INTERVAL '1 day') THEN
      RETURN NEW;
    END IF;
  END IF;

  -- REJECT: date is in the past and no grace applies
  RAISE EXCEPTION 'HISTORY LOCKED: Cannot modify data for % — historical data is permanently sealed.', target_date;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply history lock trigger to all date-bearing tables
-- DROP existing triggers first to avoid "already exists" errors

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


-- ═══════════════════════════════════════════════════════
-- LIFE OS V1 — NEW TABLES
-- ═══════════════════════════════════════════════════════

-- 28. DAILY CHECKIN — unified day seal (replaces daily_logs for new system)
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
CREATE TRIGGER tr_daily_checkin_updated BEFORE UPDATE ON daily_checkin FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS history_lock ON daily_checkin;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON daily_checkin FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('date');

-- 29. READING LOG — daily rule reading tracker
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
DROP TRIGGER IF EXISTS history_lock ON reading_log;
CREATE TRIGGER history_lock BEFORE INSERT OR UPDATE ON reading_log FOR EACH ROW EXECUTE FUNCTION enforce_history_lock('date');

-- 30. SLIPS — immutable public accountability log
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

-- SLIP IMMUTABILITY: prevent deletion
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

-- 31. ARCHITECTURE LOG — structural insights from slips
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
CREATE TRIGGER tr_arch_log_updated BEFORE UPDATE ON architecture_log FOR EACH ROW EXECUTE FUNCTION update_updated_at();
