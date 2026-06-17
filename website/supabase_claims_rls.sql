-- ═══════════════════════════════════════════════════════
-- Claims Table RLS Policies
-- ═══════════════════════════════════════════════════════

-- Enable RLS on claims table
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "claims_anon_select" ON public.claims;
DROP POLICY IF EXISTS "claims_auth_select" ON public.claims;
DROP POLICY IF EXISTS "claims_auth_write" ON public.claims;
DROP POLICY IF EXISTS "claims_public_read" ON public.claims;

-- Policy 1: Public (anonymous) users can READ all claims (for display)
CREATE POLICY "Public read claims" ON public.claims
  FOR SELECT
  USING (true);

-- Policy 2: Authenticated users (admin) can READ all claims
CREATE POLICY "Auth read claims" ON public.claims
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy 3: Authenticated users (admin) can INSERT new claims
CREATE POLICY "Auth insert claims" ON public.claims
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policy 4: Authenticated users (admin) can UPDATE claims
CREATE POLICY "Auth update claims" ON public.claims
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Policy 5: Block DELETE (claims are immutable once created)
CREATE POLICY "Block delete claims" ON public.claims
  FOR DELETE
  USING (false);

-- Verify policies were created
SELECT policyname, permissive, roles FROM pg_policies
WHERE tablename = 'claims' AND schemaname = 'public'
ORDER BY policyname;
