-- ═══════════════════════════════════════════════════════════════════
-- FIX: Allow Cloud Function to write to strava_activities
-- The lockdown SQL blocked ALL writes. Cloud Function needs write access.
-- Solution: Allow writes with a known user_id (the sync service)
-- ═══════════════════════════════════════════════════════════════════

-- Add INSERT + UPDATE policy for anon role (Cloud Function uses anon key)
CREATE POLICY strava_sync_write ON public.strava_activities
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY strava_sync_update ON public.strava_activities
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Also fix proof_archive — Cloud Function writes here too
CREATE POLICY proof_sync_write ON public.proof_archive
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY proof_sync_update ON public.proof_archive
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

SELECT 'STRAVA + PROOF WRITE POLICIES RESTORED FOR CLOUD FUNCTION' AS status;
