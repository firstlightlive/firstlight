-- ═══════════════════════════════════════════════════════
-- FIRST LIGHT — Auth Migration: PIN → Supabase Auth
-- Run this AFTER creating the user in Supabase Dashboard
--
-- BEFORE RUNNING:
-- 1. Go to Supabase Dashboard → Authentication → Users → Add User
--    Email: firstlightlive@gmail.com, Password: [your choice], Auto-confirm: YES
-- 2. Go to Auth → Settings → Disable "Enable email signup"
-- 3. Note your user UUID from the Users list
-- 4. Run this script
-- ═══════════════════════════════════════════════════════

-- ── STEP 1: Add user_id column to ALL personal tables ──

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

-- ── STEP 2: Backfill existing data with the owner's user_id ──
-- Replace YOUR_USER_UUID with actual UUID from Supabase Dashboard → Auth → Users
-- Example: UPDATE daily_rituals SET user_id = 'abc123-...' WHERE user_id IS NULL;

-- UNCOMMENT AND RUN AFTER REPLACING UUID:
-- DO $$
-- DECLARE owner_id UUID := 'PASTE_YOUR_USER_UUID_HERE';
-- BEGIN
--   UPDATE daily_rituals SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE journal_entries SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE daily_logs SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE races SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE weekly_metrics SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE monthly_grids SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE deep_work_sessions SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE engagement_counters SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE config SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE ritual_definitions SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE ritual_completions SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE stories_completions SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE weekly_schedule SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE mastery_daily SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE mastery_weekly SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE mastery_monthly_scores SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE mastery_ideas SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE brahma_daily SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE brahma_weekly SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE archive_log SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE voice_entries SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE gym_workouts SET user_id = owner_id WHERE user_id IS NULL;
--   UPDATE gym_sets SET user_id = owner_id WHERE user_id IS NULL;
-- END $$;

-- ── STEP 3: Drop old "Allow all" RLS policies ──

DROP POLICY IF EXISTS "Allow all for anon" ON daily_rituals;
DROP POLICY IF EXISTS "Allow all for anon" ON journal_entries;
DROP POLICY IF EXISTS "Allow all for anon" ON daily_logs;
DROP POLICY IF EXISTS "Allow all for anon" ON races;
DROP POLICY IF EXISTS "Allow all for anon" ON weekly_metrics;
DROP POLICY IF EXISTS "Allow all for anon" ON monthly_grids;
DROP POLICY IF EXISTS "Allow all for anon" ON deep_work_sessions;
DROP POLICY IF EXISTS "Allow all for anon" ON engagement_counters;
DROP POLICY IF EXISTS "Allow all for anon" ON config;
DROP POLICY IF EXISTS "Allow all for anon" ON ritual_definitions;
DROP POLICY IF EXISTS "Allow all for anon" ON ritual_completions;
DROP POLICY IF EXISTS "Allow all for anon" ON stories_completions;
DROP POLICY IF EXISTS "Allow all for anon" ON weekly_schedule;
DROP POLICY IF EXISTS "Allow all for anon" ON mastery_daily;
DROP POLICY IF EXISTS "Allow all for anon" ON mastery_weekly;
DROP POLICY IF EXISTS "Allow all for anon" ON mastery_monthly_scores;
DROP POLICY IF EXISTS "Allow all for anon" ON mastery_ideas;
DROP POLICY IF EXISTS "Allow all for anon" ON brahma_daily;
DROP POLICY IF EXISTS "Allow all for anon" ON brahma_weekly;
DROP POLICY IF EXISTS "Allow all for anon" ON archive_log;
DROP POLICY IF EXISTS "Allow all for anon" ON voice_entries;
DROP POLICY IF EXISTS "Allow all for anon" ON gym_workouts;
DROP POLICY IF EXISTS "Allow all for anon" ON gym_sets;

-- ── STEP 4: Create new RLS policies scoped to auth.uid() ──

CREATE POLICY "Owner access" ON daily_rituals FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON journal_entries FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON daily_logs FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON races FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON weekly_metrics FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON monthly_grids FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON deep_work_sessions FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON engagement_counters FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON config FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON ritual_definitions FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON ritual_completions FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON stories_completions FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON weekly_schedule FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON mastery_daily FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON mastery_weekly FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON mastery_monthly_scores FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON mastery_ideas FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON brahma_daily FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON brahma_weekly FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON archive_log FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON voice_entries FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON gym_workouts FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner access" ON gym_sets FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── STEP 5: Public tables keep their existing policies ──
-- comments, visitor_identities, comment_reactions — NO CHANGES (already have proper public RLS)

-- ── STEP 6: Auth Audit Log ──

CREATE TABLE IF NOT EXISTS auth_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event TEXT NOT NULL,
  email TEXT,
  user_agent TEXT,
  success BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE auth_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read audit" ON auth_audit_log FOR SELECT USING (true);
CREATE POLICY "Anyone can insert audit" ON auth_audit_log FOR INSERT WITH CHECK (true);

-- ═══════════════════════════════════════════════════════
-- DONE! Now:
-- 1. Go back and uncomment STEP 2 (backfill user_id) with your actual UUID
-- 2. Run STEP 2 to tag all existing data
-- 3. Update app.js to use Supabase Auth
-- ═══════════════════════════════════════════════════════
