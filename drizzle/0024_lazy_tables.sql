-- Lazy tables into migrations (#59): rate_limits and analytics_events were
-- created at runtime by src/services/rate-limit.ts and src/services/analytics.ts
-- (CREATE TABLE IF NOT EXISTS on first use). Both databases now get them here
-- instead; the runtime DDL stays as a harmless fallback for any environment
-- that has not run migrations yet.
--
-- Idempotent throughout: safe to apply to the Supabase primary and the Neon
-- mirror by hand or via `npm run db:migrate`. Neither table is in
-- REPLICATED_TABLES and neither gets a sync trigger — rate_limits counters
-- and analytics events are per-database by design (see the service headers).
--
-- RLS: both tables get row security + app_full_access with the same
-- role-resolution pattern as 0006/0023 (the mirror has no `revisio_app`).
-- analytics_events duplicates what 0023 does for it — deliberately: 0023
-- skips the table when absent, and on a fresh bootstrap this file runs after
-- it, so the policy must be created here too or the table would sit with RLS
-- enabled and no policy.
--
-- DDL safety: bounded lock/statement waits so a busy table cannot stall the
-- apply; RESET at the end so pooled connections do not inherit the limits.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS "rate_limits" (
  "key" text PRIMARY KEY NOT NULL,
  "window_start" timestamp with time zone NOT NULL DEFAULT now(),
  "count" integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "props" jsonb,
  "path" text,
  "anonymous_id" text,
  "user_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "analytics_events_name_time_idx"
  ON "analytics_events" USING btree ("name", "created_at");
CREATE INDEX IF NOT EXISTS "analytics_events_created_idx"
  ON "analytics_events" USING btree ("created_at");

DO $$
DECLARE
  t text;
  target_role text;
BEGIN
  target_role := CASE
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'revisio_app') THEN 'revisio_app'
    ELSE current_user
  END;
  FOREACH t IN ARRAY ARRAY['rate_limits', 'analytics_events'] LOOP
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

RESET lock_timeout;
RESET statement_timeout;
