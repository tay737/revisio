-- AI draft pipeline (#7, v1): proposal rows for teacher-reviewed card drafts.
--
-- Idempotent throughout: safe to apply to the Supabase primary and the Neon
-- mirror by hand. RLS policies resolve the app role instead of hardcoding
-- `revisio_app`, which does not exist on the mirror (see drizzle/0006).
--
-- Deliberately NO sync trigger: ai_drafts is ephemeral working state
-- (propose → accept/reject), not content — it does not replicate to the
-- mirror. The table still exists on both so schema stays aligned.

CREATE TABLE IF NOT EXISTS "ai_drafts" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "target_topic_id" text,
  "model" text NOT NULL,
  "prompt_version" text NOT NULL,
  "status" text NOT NULL DEFAULT 'proposed',
  "payload" jsonb NOT NULL,
  "source_chars" integer NOT NULL DEFAULT 0,
  "decided_by" text,
  "decided_at" timestamp,
  "decision_note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ai_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "ai_drafts_target_topic_id_topics_id_fk" FOREIGN KEY ("target_topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "ai_drafts_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_drafts_user_idx" ON "ai_drafts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_drafts_status_idx" ON "ai_drafts" USING btree ("status");--> statement-breakpoint

-- RLS: enable and grant the resolved app role full access. Without the policy
-- a write dies inside sync_capture_event while reads keep working — the
-- 2026-09-28 incident class. (No sync trigger here, but the policy is still
-- required: RLS with no policy denies every write.)
DO $$
DECLARE
  t text;
  target_role text;
  tables text[] := ARRAY['ai_drafts'];
BEGIN
  target_role := CASE
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'revisio_app') THEN 'revisio_app'
    ELSE current_user
  END;
  FOREACH t IN ARRAY tables LOOP
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
