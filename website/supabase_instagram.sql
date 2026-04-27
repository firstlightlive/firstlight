-- ═══════════════════════════════════════════════════════
-- FIRSTLIGHT — INSTAGRAM POSTS TABLE
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS instagram_posts (
  id TEXT PRIMARY KEY,
  ig_id TEXT UNIQUE,
  caption TEXT,
  media_type TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  permalink TEXT,
  timestamp TIMESTAMPTZ,
  like_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  children JSONB DEFAULT '[]',
  day_number INTEGER,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE instagram_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read ig posts" ON instagram_posts;
CREATE POLICY "Public read ig posts" ON instagram_posts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin manage ig posts" ON instagram_posts;
CREATE POLICY "Admin manage ig posts" ON instagram_posts FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ig_posts_timestamp ON instagram_posts(timestamp DESC);
