-- RLS completion for app-role tables (v1.7 follow-up).
-- profile_badges / user_profile_badges / math_sets were created after the
-- blanket RLS sweep and inherited row security with NO policy for the
-- connecting role: every SELECT returned empty (the admin panel showed
-- "no badges minted yet" over rows that existed) and every INSERT was denied
-- (granting a badge 500'd). Same incident class as _sync_events / media_assets.
--
-- Idempotent: creates each policy only when it is missing.
-- The role is resolved rather than hardcoded: the primary has `revisio_app`,
-- but the Neon mirror connects as `neondb_owner` — a literal `TO revisio_app`
-- aborts there (see drizzle/0006 for the pattern this follows).

DO $$
DECLARE
  target_role text;
BEGIN
  target_role := CASE
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'revisio_app') THEN 'revisio_app'
    ELSE current_user
  END;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profile_badges' AND policyname = 'app_full_access'
  ) THEN
    EXECUTE format(
      'CREATE POLICY app_full_access ON public.profile_badges FOR ALL TO %I USING (true) WITH CHECK (true)',
      target_role
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profile_badges' AND policyname = 'app_full_access'
  ) THEN
    EXECUTE format(
      'CREATE POLICY app_full_access ON public.user_profile_badges FOR ALL TO %I USING (true) WITH CHECK (true)',
      target_role
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'math_sets' AND policyname = 'app_full_access'
  ) THEN
    EXECUTE format(
      'CREATE POLICY app_full_access ON public.math_sets FOR ALL TO %I USING (true) WITH CHECK (true)',
      target_role
    );
  END IF;
END
$$;
