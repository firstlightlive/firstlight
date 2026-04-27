-- ═══════════════════════════════════════════════════════════════════
-- FIRSTLIGHT — COMMENTS TABLE UPGRADE
-- Adds image support, ensures correct schema for full comment system
--
-- RUN THIS IN: Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- ═══════════════════════════════════════════════════════════════════

-- Ensure comments table exists
CREATE TABLE IF NOT EXISTS public.comments (
  id            BIGSERIAL PRIMARY KEY,
  visitor_id    TEXT NOT NULL,
  display_name  TEXT NOT NULL DEFAULT 'Anonymous',
  content       TEXT NOT NULL,
  image_url     TEXT,
  parent_id     BIGINT REFERENCES public.comments(id),
  is_milestone  BOOLEAN DEFAULT FALSE,
  milestone_day INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add image_url column if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'comments' AND column_name = 'image_url') THEN
    ALTER TABLE public.comments ADD COLUMN image_url TEXT;
  END IF;
END $$;

-- Ensure comment_reactions table exists
CREATE TABLE IF NOT EXISTS public.comment_reactions (
  id          BIGSERIAL PRIMARY KEY,
  comment_id  BIGINT NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  visitor_id  TEXT NOT NULL,
  reaction    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(comment_id, visitor_id)
);

-- RLS: public read + write for both tables (community feature)
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'comments' AND schemaname = 'public'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.comments', r.policyname); END LOOP;
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'comment_reactions' AND schemaname = 'public'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.comment_reactions', r.policyname); END LOOP;
END $$;

CREATE POLICY comments_public ON public.comments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY reactions_public ON public.comment_reactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Index for fast feed loading
CREATE INDEX IF NOT EXISTS idx_comments_created ON public.comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_reactions_comment ON public.comment_reactions(comment_id);

SELECT 'COMMENTS UPGRADE COMPLETE' AS status;
