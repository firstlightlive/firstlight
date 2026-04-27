-- ═══════════════════════════════════════════
-- FIX: Lock down private tables
-- Only authenticated users can read/write these
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════

-- BRAHMACHARYA — private
DROP POLICY IF EXISTS "Allow all for anon" ON brahma_daily;
CREATE POLICY "Auth only" ON brahma_daily FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for anon" ON brahma_weekly;
CREATE POLICY "Auth only" ON brahma_weekly FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- JOURNAL — private
DROP POLICY IF EXISTS "Allow all for anon" ON journal_entries;
CREATE POLICY "Auth only" ON journal_entries FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- DAILY CHECKIN — private
DROP POLICY IF EXISTS "Allow all for anon" ON daily_checkin;
CREATE POLICY "Auth only" ON daily_checkin FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- DAILY RITUALS — private
DROP POLICY IF EXISTS "Allow all for anon" ON daily_rituals;
CREATE POLICY "Auth only" ON daily_rituals FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- MASTERY — private
DROP POLICY IF EXISTS "Allow all for anon" ON mastery_daily;
CREATE POLICY "Auth only" ON mastery_daily FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for anon" ON mastery_weekly;
CREATE POLICY "Auth only" ON mastery_weekly FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for anon" ON mastery_ideas;
CREATE POLICY "Auth only" ON mastery_ideas FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- DEEP WORK — private
DROP POLICY IF EXISTS "Allow all for anon" ON deep_work_sessions;
CREATE POLICY "Auth only" ON deep_work_sessions FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- GYM — private
DROP POLICY IF EXISTS "Allow all for anon" ON gym_workouts;
CREATE POLICY "Auth only" ON gym_workouts FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- VOICE — private
DROP POLICY IF EXISTS "Allow all for anon" ON voice_entries;
CREATE POLICY "Auth only" ON voice_entries FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- READING LOG — private
DROP POLICY IF EXISTS "Allow all for anon" ON reading_log;
CREATE POLICY "Auth only" ON reading_log FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ARCHITECTURE LOG — private
DROP POLICY IF EXISTS "Allow all for anon" ON architecture_log;
CREATE POLICY "Auth only" ON architecture_log FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ═══════════════════════════════════════════
-- KEEP PUBLIC: These tables are intentionally public
-- instagram_posts — public (website displays them)
-- strava_activities — public (website displays them)
-- proof_archive — public (website displays them)
-- slips — public SELECT only (accountability ledger)
-- comments — public (community section)
-- config — needs anon for sync function
-- ═══════════════════════════════════════════
