-- ═══════════════════════════════════════════════════════
-- FIRST LIGHT — Apple Health Metrics Schema
-- Source: Health Auto Export app → Cloud Function → Supabase
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════

-- 1. HEALTH METRICS — granular daily health data from Apple Watch
-- One row per metric per date (e.g., date=2026-04-27, metric=sleep_duration)
CREATE TABLE IF NOT EXISTS health_metrics (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  metric TEXT NOT NULL,
  value NUMERIC,
  unit TEXT,
  source TEXT DEFAULT 'apple_watch',
  raw_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, metric)
);

-- 2. HEALTH DAILY SUMMARY — one row per day, all key metrics flattened
-- Fast reads for dashboard — no joins needed
CREATE TABLE IF NOT EXISTS health_daily (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL UNIQUE,

  -- SLEEP
  sleep_hours NUMERIC(4,2),
  sleep_deep_min INTEGER,
  sleep_rem_min INTEGER,
  sleep_core_min INTEGER,
  sleep_awake_min INTEGER,
  bedtime TEXT,
  wake_time TEXT,
  sleep_score INTEGER,              -- computed: 0-100

  -- HEART
  resting_hr INTEGER,
  avg_hr INTEGER,
  max_hr INTEGER,
  min_hr INTEGER,
  hrv_avg NUMERIC(5,1),             -- ms (Heart Rate Variability)
  hrv_sdnn NUMERIC(5,1),

  -- FITNESS
  vo2_max NUMERIC(4,1),
  active_calories INTEGER,
  basal_calories INTEGER,
  total_calories INTEGER,
  exercise_minutes INTEGER,
  stand_hours INTEGER,

  -- ACTIVITY
  steps INTEGER,
  distance_km NUMERIC(6,2),
  flights_climbed INTEGER,
  walking_speed NUMERIC(4,2),       -- km/h
  walking_step_length NUMERIC(5,1), -- cm
  walking_asymmetry NUMERIC(4,1),   -- %
  walking_double_support NUMERIC(4,1), -- %

  -- BODY
  weight_kg NUMERIC(5,2),
  bmi NUMERIC(4,1),
  body_fat_pct NUMERIC(4,1),
  lean_body_mass NUMERIC(5,2),

  -- BLOOD & RESPIRATORY
  blood_oxygen_pct NUMERIC(4,1),
  respiratory_rate NUMERIC(4,1),    -- breaths/min

  -- ENVIRONMENT
  noise_exposure_db NUMERIC(5,1),

  -- WORKOUT SUMMARY (from Apple Watch workouts that day)
  workout_count INTEGER DEFAULT 0,
  workout_types JSONB DEFAULT '[]',  -- ["running", "strength_training"]
  workout_total_min INTEGER DEFAULT 0,
  workout_total_cal INTEGER DEFAULT 0,

  -- META
  source TEXT DEFAULT 'health_auto_export',
  raw_payload JSONB DEFAULT '{}',   -- full JSON from Health Auto Export
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. HEALTH WEEKLY SUMMARY — aggregated weekly view
-- Computed by Cloud Function every Sunday or on-demand
CREATE TABLE IF NOT EXISTS health_weekly (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  week_start DATE NOT NULL UNIQUE,  -- Monday of the week

  -- SLEEP AVERAGES
  avg_sleep_hours NUMERIC(4,2),
  avg_sleep_score INTEGER,
  sleep_consistency_pct INTEGER,     -- how consistent bedtime/wake across week
  total_deep_min INTEGER,
  total_rem_min INTEGER,

  -- HEART AVERAGES
  avg_resting_hr INTEGER,
  avg_hrv NUMERIC(5,1),
  hrv_trend TEXT CHECK (hrv_trend IN ('improving', 'stable', 'declining')),

  -- FITNESS
  avg_vo2_max NUMERIC(4,1),
  total_active_cal INTEGER,
  total_exercise_min INTEGER,
  total_steps INTEGER,
  total_distance_km NUMERIC(7,2),
  total_workouts INTEGER,

  -- RECOVERY SCORE (computed)
  recovery_score INTEGER,            -- 0-100 based on HRV + resting HR + sleep

  -- INSIGHTS (computed by analysis function)
  insights JSONB DEFAULT '[]',       -- [{type:"warning", msg:"HRV dropped 15% this week"}]
  correlations JSONB DEFAULT '{}',   -- {sleep_vs_hrv: 0.72, training_vs_rhr: -0.45}

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- INDEXES — optimized for dashboard queries
-- ═══════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_health_metrics_date ON health_metrics(date);
CREATE INDEX IF NOT EXISTS idx_health_metrics_metric ON health_metrics(metric, date);
CREATE INDEX IF NOT EXISTS idx_health_daily_date ON health_daily(date);
CREATE INDEX IF NOT EXISTS idx_health_weekly_week ON health_weekly(week_start);

-- Date range queries (year view, month view)
CREATE INDEX IF NOT EXISTS idx_health_daily_range ON health_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_health_weekly_range ON health_weekly(week_start DESC);

-- ═══════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════
ALTER TABLE health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_weekly ENABLE ROW LEVEL SECURITY;

-- Public SELECT (for the health dashboard page), restricted INSERT/UPDATE
CREATE POLICY "anon_select_health_metrics" ON health_metrics FOR SELECT USING (true);
CREATE POLICY "anon_insert_health_metrics" ON health_metrics FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_health_metrics" ON health_metrics FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_health_daily" ON health_daily FOR SELECT USING (true);
CREATE POLICY "anon_insert_health_daily" ON health_daily FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_health_daily" ON health_daily FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_health_weekly" ON health_weekly FOR SELECT USING (true);
CREATE POLICY "anon_insert_health_weekly" ON health_weekly FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_health_weekly" ON health_weekly FOR UPDATE USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════
CREATE TRIGGER tr_health_metrics_updated BEFORE UPDATE ON health_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_health_daily_updated BEFORE UPDATE ON health_daily FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_health_weekly_updated BEFORE UPDATE ON health_weekly FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════
-- ALSO: update sleep_log table if it doesn't exist
-- (backward compatibility with existing homepage code)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sleep_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  sleep_hours NUMERIC(4,2),
  bedtime TEXT,
  wake_time TEXT,
  source TEXT DEFAULT 'apple_watch',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sleep_log_date ON sleep_log(date);
ALTER TABLE sleep_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_sleep_log" ON sleep_log FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER tr_sleep_log_updated BEFORE UPDATE ON sleep_log FOR EACH ROW EXECUTE FUNCTION update_updated_at();
