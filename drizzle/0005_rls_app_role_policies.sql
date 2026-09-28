-- RLS completion for app-role tables (v1.7 follow-up).
-- profile_badges / user_profile_badges / math_sets were created after the
-- blanket RLS sweep and inherited row security with NO policy for the
-- connecting role: every SELECT returned empty (the admin panel showed
-- "no badges minted yet" over rows that existed) and every INSERT was denied
-- (granting a badge 500'd). Same incident class as _sync_events / media_assets.
--
-- Idempotent: creates each policy only when it is missing.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profile_badges' AND policyname = 'app_full_access'
  ) THEN
    CREATE POLICY app_full_access ON public.profile_badges
      FOR ALL TO revisio_app USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profile_badges' AND policyname = 'app_full_access'
  ) THEN
    CREATE POLICY app_full_access ON public.user_profile_badges
      FOR ALL TO revisio_app USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'math_sets' AND policyname = 'app_full_access'
  ) THEN
    CREATE POLICY app_full_access ON public.math_sets
      FOR ALL TO revisio_app USING (true) WITH CHECK (true);
  END IF;
END
$$;
