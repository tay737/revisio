-- #5: teacher-assigned topic decks per class.
--
-- Idempotent throughout: safe to apply to the Supabase primary and the Neon
-- mirror by hand. RLS policies resolve the app role instead of hardcoding
-- `revisio_app`, which does not exist on the mirror (see drizzle/0006).
-- APPLY TO BOTH DATABASES BEFORE THE CODE DEPLOYS (new rule after #20).

CREATE TABLE IF NOT EXISTS "class_assignments" (
  "id" text PRIMARY KEY NOT NULL,
  "class_id" text NOT NULL,
  "topic_id" text NOT NULL,
  "due_date" text,
  "note_density" text NOT NULL DEFAULT 'standard',
  "required" boolean NOT NULL DEFAULT true,
  "note" text NOT NULL DEFAULT '',
  "created_by" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "class_assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "class_assignments_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "class_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "class_assignments_class_topic_idx" ON "class_assignments" USING btree ("class_id","topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_assignments_class_idx" ON "class_assignments" USING btree ("class_id");--> statement-breakpoint

DROP TRIGGER IF EXISTS "class_assignments__sync_trg" ON "class_assignments";
CREATE TRIGGER "class_assignments__sync_trg" AFTER INSERT OR UPDATE OR DELETE ON "class_assignments" FOR EACH ROW EXECUTE FUNCTION sync_capture_event('id');--> statement-breakpoint

DO $$
DECLARE
  target_role text;
BEGIN
  target_role := CASE
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'revisio_app') THEN 'revisio_app'
    ELSE current_user
  END;
  ALTER TABLE public.class_assignments ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'class_assignments' AND policyname = 'app_full_access'
  ) THEN
    EXECUTE format(
      'CREATE POLICY app_full_access ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',
      'class_assignments', target_role
    );
  END IF;
END
$$;
