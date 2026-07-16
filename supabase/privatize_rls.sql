-- ═══════════════════════════════════════════════════════════════
-- PHASE 2 — Lock the last 5 anon-readable tables to the logged-in owner.
--
-- Each table currently has ONE policy `open_access` (cmd=ALL) granted to
-- {anon, authenticated}. We narrow it to {authenticated} only. Effect:
--   • A stranger with the public anon key can no longer read OR write these.
--   • The signed-in owner still has full access — pages read with the session
--     JWT via website/js/fl-authread.js (fetch shim), edge functions use the
--     service_role client which BYPASSES RLS entirely.
--
-- Data is NOT touched. This only changes who the policy applies to. Fully
-- reversible (see ROLLBACK block at the bottom).
--
-- APPLY AT DEPLOY, with the owner logged in, then immediately confirm the
-- dashboard still shows data. If anything reads empty, run the ROLLBACK.
--
-- Prereq already shipped: firstlight-sync edge reads of strava_activities were
-- switched from supaAnon → supaAdmin (service role) so digests don't break.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER POLICY open_access ON public.proof_archive      TO authenticated;
ALTER POLICY open_access ON public.strava_activities  TO authenticated;
ALTER POLICY open_access ON public.slips              TO authenticated;
ALTER POLICY open_access ON public.instagram_posts    TO authenticated;
ALTER POLICY open_access ON public.comments           TO authenticated;

COMMIT;

-- Verify (anon should now see 0 policies granting it these tables):
--   SELECT tablename, policyname, roles::text FROM pg_policies
--   WHERE schemaname='public'
--     AND tablename IN ('proof_archive','strava_activities','slips','instagram_posts','comments');

-- ─────────────────────────────────────────────────────────────
-- ROLLBACK (re-open to anon) — run this if the dashboard reads empty:
--
--   ALTER POLICY open_access ON public.proof_archive      TO anon, authenticated;
--   ALTER POLICY open_access ON public.strava_activities  TO anon, authenticated;
--   ALTER POLICY open_access ON public.slips              TO anon, authenticated;
--   ALTER POLICY open_access ON public.instagram_posts    TO anon, authenticated;
--   ALTER POLICY open_access ON public.comments           TO anon, authenticated;
-- ─────────────────────────────────────────────────────────────
