CREATE TABLE IF NOT EXISTS strava_activities (
  id BIGINT PRIMARY KEY,
  name TEXT,
  type TEXT,
  sport_type TEXT,
  distance NUMERIC(10,2) DEFAULT 0,
  moving_time INTEGER DEFAULT 0,
  elapsed_time INTEGER DEFAULT 0,
  total_elevation_gain NUMERIC(8,2) DEFAULT 0,
  start_date TIMESTAMPTZ,
  start_date_local TIMESTAMPTZ,
  average_speed NUMERIC(6,3),
  max_speed NUMERIC(6,3),
  average_heartrate NUMERIC(5,1),
  max_heartrate INTEGER,
  average_cadence NUMERIC(5,1),
  calories NUMERIC(8,1),
  suffer_score INTEGER,
  pr_count INTEGER DEFAULT 0,
  achievement_count INTEGER DEFAULT 0,
  kudos_count INTEGER DEFAULT 0,
  summary_polyline TEXT,
  gear_id TEXT,
  workout_type INTEGER,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE strava_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read strava" ON strava_activities;
CREATE POLICY "Public read strava" ON strava_activities FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin manage strava" ON strava_activities;
CREATE POLICY "Admin manage strava" ON strava_activities FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_strava_date ON strava_activities(start_date_local DESC);
CREATE INDEX IF NOT EXISTS idx_strava_type ON strava_activities(type);
