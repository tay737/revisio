-- RLS gap fix (#67, P0): analytics_events + exam_papers had row security
-- enabled with ZERO policies on the Supabase primary — the 2026-09-28
-- incident class. revisio_app holds table privileges but no policy, so every
-- INSERT/UPDATE as the app role is denied: analytics ingestion
-- (POST /api/v1/events) and exam paper writes 500 in production.
--
-- Idempotent and safe on both databases: skips tables that do not exist
-- (analytics_events is a lazy, non-replicated table — absent on the Neon
-- mirror), resolves the app role instead of hardcoding `revisio_app` (the
-- mirror has no such role — see drizzle/0006 and 0021_ai_drafts).

DO $$
DECLARE
  t text;
  target_role text;
  tables text[] := ARRAY['analytics_events', 'exam_papers'];
BEGIN
  target_role := CASE
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'revisio_app') THEN 'revisio_app'
    ELSE current_user
  END;
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'app_full_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY app_full_access ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',
        t, target_role
      );
    END IF;
  END LOOP;
END
$$;
