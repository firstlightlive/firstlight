-- ═══════════════════════════════════════════════════════
-- FIRST LIGHT — Auth Migration (READY TO RUN)
-- User UUID: 85b2a5d2-3118-469b-94ed-c720a6af462
-- Email: firstlightlive@gmail.com
--
-- PASTE THIS ENTIRE FILE into Supabase SQL Editor and RUN
-- ═══════════════════════════════════════════════════════

-- ── STEP 1: Add user_id column to ALL 23 personal tables ──

ALTER TABLE daily_rituals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE races ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE weekly_metrics ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE monthly_grids ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE deep_work_sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE engagement_counters ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE config ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE ritual_definitions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE ritual_completions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE stories_completions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE weekly_schedule ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE mastery_daily ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE mastery_weekly ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE mastery_monthly_scores ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE mastery_ideas ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE brahma_daily ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE brahma_weekly ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE archive_log ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE voice_entries ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE gym_workouts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE gym_sets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- ── STEP 2: Backfill ALL existing data with your user_id ──

UPDATE daily_rituals SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE journal_entries SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE daily_logs SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE races SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE weekly_metrics SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE monthly_grids SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE deep_work_sessions SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE engagement_counters SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE config SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE ritual_definitions SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE ritual_completions SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE stories_completions SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE weekly_schedule SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE mastery_daily SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE mastery_weekly SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE mastery_monthly_scores SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE mastery_ideas SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE brahma_daily SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE brahma_weekly SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE archive_log SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE voice_entries SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE gym_workouts SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;
UPDATE gym_sets SET user_id = '85b2a5d2-3118-469b-94ed-c720a6af4625' WHERE user_id IS NULL;

-- ── STEP 3: Drop old "Allow all for anon" RLS policies ──

DROP POLICY IF EXISTS "Allow all for anon" ON daily_rituals;

-- ── STEP 4: Create new RLS policies scoped to auth.uid() ──

DROP POLICY IF EXISTS "Owner access" ON daily_rituals;
CREATE POLICY "Owner access" ON daily_rituals FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON journal_entries;
CREATE POLICY "Owner access" ON journal_entries FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON daily_logs;
CREATE POLICY "Owner access" ON daily_logs FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON races;
CREATE POLICY "Owner access" ON races FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON weekly_metrics;
CREATE POLICY "Owner access" ON weekly_metrics FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON monthly_grids;
CREATE POLICY "Owner access" ON monthly_grids FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON deep_work_sessions;
CREATE POLICY "Owner access" ON deep_work_sessions FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON engagement_counters;
CREATE POLICY "Owner access" ON engagement_counters FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON config;
CREATE POLICY "Owner access" ON config FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON ritual_definitions;
CREATE POLICY "Owner access" ON ritual_definitions FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON ritual_completions;
CREATE POLICY "Owner access" ON ritual_completions FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON stories_completions;
CREATE POLICY "Owner access" ON stories_completions FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON weekly_schedule;
CREATE POLICY "Owner access" ON weekly_schedule FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON mastery_daily;
CREATE POLICY "Owner access" ON mastery_daily FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON mastery_weekly;
CREATE POLICY "Owner access" ON mastery_weekly FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON mastery_monthly_scores;
CREATE POLICY "Owner access" ON mastery_monthly_scores FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON mastery_ideas;
CREATE POLICY "Owner access" ON mastery_ideas FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON brahma_daily;
CREATE POLICY "Owner access" ON brahma_daily FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON brahma_weekly;
CREATE POLICY "Owner access" ON brahma_weekly FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON archive_log;
CREATE POLICY "Owner access" ON archive_log FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON voice_entries;
CREATE POLICY "Owner access" ON voice_entries FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON gym_workouts;
CREATE POLICY "Owner access" ON gym_workouts FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner access" ON gym_sets;
CREATE POLICY "Owner access" ON gym_sets FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── STEP 5: Public tables — NO CHANGES (keep existing public RLS) ──
-- comments: "Anyone can read comments" + "Anyone can insert comments" ← KEEP
-- visitor_identities: "Anyone can register" ← KEEP
-- comment_reactions: "Anyone can read/react/unreact" ← KEEP

-- ── STEP 6: Auth Audit Log table ──

CREATE TABLE IF NOT EXISTS auth_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event TEXT NOT NULL,
  email TEXT,
  user_agent TEXT,
  success BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE auth_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read audit" ON auth_audit_log;
CREATE POLICY "Anyone can read audit" ON auth_audit_log FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can insert audit" ON auth_audit_log;
CREATE POLICY "Anyone can insert audit" ON auth_audit_log FOR INSERT WITH CHECK (true);

-- ═══════════════════════════════════════════════════════
-- DONE!
-- 23 tables now have user_id column + "Owner access" RLS
-- 3 public tables unchanged (comments, visitor_identities, comment_reactions)
-- 1 new auth_audit_log table created
-- All existing data tagged with user_id 85b2a5d2-3118-469b-94ed-c720a6af462
-- ═══════════════════════════════════════════════════════
