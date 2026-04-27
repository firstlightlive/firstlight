-- ═══════════════════════════════════════════════════════════════════
-- FIRSTLIGHT — GOALS MODULE (15-year durable design)
--
-- Two tables: goals + goal_comments (structured progress log)
-- Five time horizons: weekly, monthly, quarterly, yearly, longterm
-- Six statuses: on_track, behind, blocked, paused, completed, archived
--
-- RUN THIS IN: Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════
-- TABLE 1: goals
-- ══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.goals (
  id            BIGSERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT,
  horizon       TEXT NOT NULL CHECK (horizon IN ('weekly','monthly','quarterly','yearly','longterm')),
  category      TEXT DEFAULT 'general',    -- pillar: body, mind, career, spiritual, financial, etc.
  owner         TEXT DEFAULT 'Anupam',
  status        TEXT NOT NULL DEFAULT 'on_track' CHECK (status IN ('on_track','behind','blocked','paused','completed','archived')),
  progress      INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  milestones    JSONB DEFAULT '[]',        -- [{title, done, date}]
  start_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  target_date   DATE,
  completed_at  TIMESTAMPTZ,
  archived_at   TIMESTAMPTZ,
  completion_note TEXT,                    -- final summary when completed
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id       UUID
);

-- ══════════════════════════════════════
-- TABLE 2: goal_comments (structured progress log)
-- ══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.goal_comments (
  id            BIGSERIAL PRIMARY KEY,
  goal_id       BIGINT NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  comment_text  TEXT NOT NULL,
  author        TEXT DEFAULT 'Anupam',
  comment_type  TEXT NOT NULL DEFAULT 'update' CHECK (comment_type IN ('update','blocker','milestone','decision','completion')),
  progress_from INTEGER,                   -- e.g. 40
  progress_to   INTEGER,                   -- e.g. 55
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_goals_horizon ON public.goals(horizon);
CREATE INDEX IF NOT EXISTS idx_goals_status ON public.goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_updated ON public.goals(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_goal_comments_goal ON public.goal_comments(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_comments_created ON public.goal_comments(created_at DESC);

-- ══════════════════════════════════════
-- AUTO-UPDATE updated_at
-- ══════════════════════════════════════

CREATE OR REPLACE FUNCTION update_goals_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS goals_updated_at ON public.goals;
CREATE TRIGGER goals_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW
  EXECUTE FUNCTION update_goals_timestamp();

-- ══════════════════════════════════════
-- RLS — same pattern as other admin tables
-- ══════════════════════════════════════

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_comments ENABLE ROW LEVEL SECURITY;

-- Drop existing
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename IN ('goals','goal_comments') AND schemaname = 'public'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, CASE WHEN r.policyname LIKE '%comment%' THEN 'goal_comments' ELSE 'goals' END); END LOOP;
END $$;

-- Read: anyone (for potential public goal display)
CREATE POLICY goals_read ON public.goals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY goal_comments_read ON public.goal_comments FOR SELECT TO anon, authenticated USING (true);

-- Write: anon with user_id or authenticated
CREATE POLICY goals_write ON public.goals FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY goals_update ON public.goals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY goals_delete ON public.goals FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY goal_comments_write ON public.goal_comments FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ══════════════════════════════════════
-- VERIFY
-- ══════════════════════════════════════

SELECT 'GOALS MODULE READY' AS status;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'goals' AND table_schema = 'public' ORDER BY ordinal_position;
