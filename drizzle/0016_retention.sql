-- Retention epic (#9): streak freezes/history, opt-in reminders, challenges,
-- goals, exam plans and safe social links.
--
-- Idempotent throughout: safe to apply to the Supabase primary and the Neon
-- mirror by hand. RLS policies resolve the app role instead of hardcoding
-- `revisio_app`, which does not exist on the mirror (see drizzle/0006).

ALTER TABLE "streaks" ADD COLUMN IF NOT EXISTS "freezes" integer NOT NULL DEFAULT 0;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "streak_events" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "kind" text NOT NULL,
  "streak_before" integer NOT NULL DEFAULT 0,
  "streak_after" integer NOT NULL DEFAULT 0,
  "meta" jsonb,
  "occurred_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "streak_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "streak_events_user_time_idx" ON "streak_events" USING btree ("user_id","occurred_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notification_prefs" (
  "user_id" text PRIMARY KEY NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  "local_time" text NOT NULL DEFAULT '18:00',
  "timezone" text NOT NULL DEFAULT 'UTC',
  "quiet_start" text,
  "quiet_end" text,
  "triggers" jsonb NOT NULL DEFAULT '{"dueCards":true,"streakRisk":true,"seasonEnding":true,"achievement":true}'::jsonb,
  "channel" text NOT NULL DEFAULT 'email',
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "href" text NOT NULL DEFAULT '/dashboard',
  "read_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_time_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notification_deliveries" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "kind" text NOT NULL,
  "channel" text NOT NULL DEFAULT 'email',
  "dedupe_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'sent',
  "detail" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_deliveries_dedupe_idx" ON "notification_deliveries" USING btree ("user_id","kind","dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_deliveries_user_idx" ON "notification_deliveries" USING btree ("user_id","created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "exam_plans" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "subject_id" text,
  "title" text NOT NULL,
  "exam_date" text NOT NULL,
  "topic_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "daily_target" integer NOT NULL DEFAULT 10,
  "status" text NOT NULL DEFAULT 'active',
  "reflection" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "exam_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "exam_plans_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_plans_user_idx" ON "exam_plans" USING btree ("user_id","status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_challenges" (
  "user_id" text NOT NULL,
  "challenge_id" text NOT NULL,
  "period_start" text NOT NULL,
  "progress" integer NOT NULL DEFAULT 0,
  "target" integer NOT NULL,
  "completed_at" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "user_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_challenges_pk" ON "user_challenges" USING btree ("user_id","challenge_id","period_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_challenges_user_idx" ON "user_challenges" USING btree ("user_id","period_start");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_goals" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "target" integer NOT NULL,
  "scope" jsonb,
  "deadline" text,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "user_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_goals_user_idx" ON "user_goals" USING btree ("user_id","completed_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "study_connections" (
  "id" text PRIMARY KEY NOT NULL,
  "pair_key" text NOT NULL,
  "requester_id" text NOT NULL,
  "addressee_id" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'buddy',
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "responded_at" timestamp,
  CONSTRAINT "study_connections_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "study_connections_addressee_id_users_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "study_connections_pair_idx" ON "study_connections" USING btree ("pair_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_connections_requester_idx" ON "study_connections" USING btree ("requester_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_connections_addressee_idx" ON "study_connections" USING btree ("addressee_id","status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "guardian_links" (
  "id" text PRIMARY KEY NOT NULL,
  "student_id" text NOT NULL,
  "guardian_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "scope" jsonb NOT NULL DEFAULT '{"reviews":true,"streak":true,"accuracy":true}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "responded_at" timestamp,
  CONSTRAINT "guardian_links_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "guardian_links_guardian_id_users_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "guardian_links_pair_idx" ON "guardian_links" USING btree ("student_id","guardian_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guardian_links_student_idx" ON "guardian_links" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guardian_links_guardian_idx" ON "guardian_links" USING btree ("guardian_id","status");--> statement-breakpoint

-- Mirror change-capture triggers, matching every other app table.
DROP TRIGGER IF EXISTS "streak_events__sync_trg" ON "streak_events";
CREATE TRIGGER "streak_events__sync_trg" AFTER INSERT OR UPDATE OR DELETE ON "streak_events" FOR EACH ROW EXECUTE FUNCTION sync_capture_event('id');--> statement-breakpoint
DROP TRIGGER IF EXISTS "notification_prefs__sync_trg" ON "notification_prefs";
CREATE TRIGGER "notification_prefs__sync_trg" AFTER INSERT OR UPDATE OR DELETE ON "notification_prefs" FOR EACH ROW EXECUTE FUNCTION sync_capture_event('user_id');--> statement-breakpoint
DROP TRIGGER IF EXISTS "notifications__sync_trg" ON "notifications";
CREATE TRIGGER "notifications__sync_trg" AFTER INSERT OR UPDATE OR DELETE ON "notifications" FOR EACH ROW EXECUTE FUNCTION sync_capture_event('id');--> statement-breakpoint
DROP TRIGGER IF EXISTS "notification_deliveries__sync_trg" ON "notification_deliveries";
CREATE TRIGGER "notification_deliveries__sync_trg" AFTER INSERT OR UPDATE OR DELETE ON "notification_deliveries" FOR EACH ROW EXECUTE FUNCTION sync_capture_event('id');--> statement-breakpoint
DROP TRIGGER IF EXISTS "exam_plans__sync_trg" ON "exam_plans";
CREATE TRIGGER "exam_plans__sync_trg" AFTER INSERT OR UPDATE OR DELETE ON "exam_plans" FOR EACH ROW EXECUTE FUNCTION sync_capture_event('id');--> statement-breakpoint
DROP TRIGGER IF EXISTS "user_challenges__sync_trg" ON "user_challenges";
CREATE TRIGGER "user_challenges__sync_trg" AFTER INSERT OR UPDATE OR DELETE ON "user_challenges" FOR EACH ROW EXECUTE FUNCTION sync_capture_event('user_id,challenge_id,period_start');--> statement-breakpoint
DROP TRIGGER IF EXISTS "user_goals__sync_trg" ON "user_goals";
CREATE TRIGGER "user_goals__sync_trg" AFTER INSERT OR UPDATE OR DELETE ON "user_goals" FOR EACH ROW EXECUTE FUNCTION sync_capture_event('id');--> statement-breakpoint
DROP TRIGGER IF EXISTS "study_connections__sync_trg" ON "study_connections";
CREATE TRIGGER "study_connections__sync_trg" AFTER INSERT OR UPDATE OR DELETE ON "study_connections" FOR EACH ROW EXECUTE FUNCTION sync_capture_event('id');--> statement-breakpoint
DROP TRIGGER IF EXISTS "guardian_links__sync_trg" ON "guardian_links";
CREATE TRIGGER "guardian_links__sync_trg" AFTER INSERT OR UPDATE OR DELETE ON "guardian_links" FOR EACH ROW EXECUTE FUNCTION sync_capture_event('id');--> statement-breakpoint

-- RLS: enable on every new table and grant the resolved app role full access.
-- Without the policy a write dies inside sync_capture_event while reads keep
-- working — the 2026-09-28 incident class.
DO $$
DECLARE
  t text;
  target_role text;
  tables text[] := ARRAY[
    'streak_events','notification_prefs','notifications','notification_deliveries',
    'exam_plans','user_challenges','user_goals','study_connections','guardian_links'
  ];
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
