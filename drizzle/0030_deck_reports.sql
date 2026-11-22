-- deck_reports (F12/D11, "Report this deck"): the moderation-queue row behind
-- POST /api/v1/decks/report. One row per (user, deck); a repeat report is a
-- no-op via the unique index. `status` is the queue state admins action by
-- hand (open → reviewed/actioned/dismissed).
--
-- Primary-only by design, like rate_limits/analytics_events (0024): no sync
-- trigger, not in REPLICATED_TABLES — moderation reads happen on the primary
-- and the mirror has no use for learner reports. The table IS still created
-- on the mirror so both databases share one schema.
--
-- RLS: row security + app_full_access with the same role-resolution pattern
-- as 0006/0023/0024 (the Neon mirror has no `revisio_app` role).
--
-- Idempotent throughout: safe to apply to Supabase and Neon via
-- `npm run db:migrate` or by hand. Apply to BOTH databases BEFORE the code
-- that reads/writes it deploys.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS "deck_reports" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "deck_topic_id" text NOT NULL REFERENCES "topics"("id") ON DELETE cascade,
  "reason" text,
  "status" text NOT NULL DEFAULT 'open',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "deck_reports_pk"
  ON "deck_reports" USING btree ("user_id", "deck_topic_id");
CREATE INDEX IF NOT EXISTS "deck_reports_deck_idx"
  ON "deck_reports" USING btree ("deck_topic_id");

DO $$
DECLARE
  target_role text;
BEGIN
  target_role := CASE
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'revisio_app') THEN 'revisio_app'
    ELSE current_user
  END;
  IF to_regclass('public.deck_reports') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.deck_reports ENABLE ROW LEVEL SECURITY';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'deck_reports' AND policyname = 'app_full_access'
  ) THEN
    EXECUTE format(
      'CREATE POLICY app_full_access ON public.deck_reports FOR ALL TO %I USING (true) WITH CHECK (true)',
      target_role
    );
  END IF;
END
$$;

RESET lock_timeout;
RESET statement_timeout;
