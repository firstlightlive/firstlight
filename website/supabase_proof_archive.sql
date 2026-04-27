CREATE TABLE IF NOT EXISTS proof_archive (
  date DATE PRIMARY KEY,
  day_number INTEGER,
  sleep_hrs NUMERIC(4,2),
  run_km NUMERIC(6,2),
  run_time_sec INTEGER,
  run_pace TEXT,
  avg_hr NUMERIC(5,1),
  max_hr INTEGER,
  calories NUMERIC(8,1),
  elevation NUMERIC(8,2),
  gym BOOLEAN DEFAULT FALSE,
  gym_duration_min INTEGER,
  food_clean BOOLEAN DEFAULT TRUE,
  run_source TEXT,
  strava_id BIGINT,
  ig_post_id TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE proof_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read proof" ON proof_archive;
CREATE POLICY "Public read proof" ON proof_archive FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin manage proof" ON proof_archive;
CREATE POLICY "Admin manage proof" ON proof_archive FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_proof_date ON proof_archive(date DESC);
