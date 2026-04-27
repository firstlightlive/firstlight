-- Site visitor tracking
CREATE TABLE IF NOT EXISTS site_visits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  page TEXT NOT NULL DEFAULT 'index',
  visitor_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily aggregated counts (faster queries)
CREATE TABLE IF NOT EXISTS site_stats (
  date DATE PRIMARY KEY,
  total_visits INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_stats ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a visit (public pages)
DROP POLICY IF EXISTS "Public insert visits" ON site_visits;
CREATE POLICY "Public insert visits" ON site_visits FOR INSERT WITH CHECK (true);

-- Anyone can read stats (for public counter)
DROP POLICY IF EXISTS "Public read stats" ON site_stats;
CREATE POLICY "Public read stats" ON site_stats FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public write stats" ON site_stats;
CREATE POLICY "Public write stats" ON site_stats FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_visits_date ON site_visits(date);
