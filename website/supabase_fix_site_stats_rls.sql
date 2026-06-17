-- ═══════════════════════════════════════════════════════
-- Fix site_stats RLS (Security Hardening)
-- ═══════════════════════════════════════════════════════

-- Drop the overly-permissive policy
DROP POLICY IF EXISTS "Public write stats" ON site_stats;

-- Create secure policies:
-- 1. Public can READ only
CREATE POLICY "Public read stats" ON site_stats
  FOR SELECT
  USING (true);

-- 2. Authenticated (admin) can INSERT
CREATE POLICY "Admin insert stats" ON site_stats
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- 3. Authenticated (admin) can UPDATE
CREATE POLICY "Admin update stats" ON site_stats
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 4. Block all DELETE (stats are immutable)
CREATE POLICY "Block delete stats" ON site_stats
  FOR DELETE
  USING (false);

-- Verify new policies
SELECT policyname, permissive, roles FROM pg_policies
WHERE tablename = 'site_stats' AND schemaname = 'public'
ORDER BY policyname;
