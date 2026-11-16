-- Deck library (#6): follow/copy subscriptions for public decks.
--
-- Idempotent throughout: safe to apply to the Supabase primary and the Neon
-- mirror by hand. RLS policies resolve the app role instead of hardcoding
-- `revisio_app`, which does not exist on the mirror (see drizzle/0006).

CREATE TABLE IF NOT EXISTS "deck_subscriptions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "deck_topic_id" text NOT NULL,
  "copy_topic_id" text NOT NULL,
  "cards_at_follow" integer NOT NULL DEFAULT 0,
  "lessons_at_follow" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "deck_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "deck_subscriptions_deck_topic_id_topics_id_fk" FOREIGN KEY ("deck_topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "deck_subscriptions_copy_topic_id_topics_id_fk" FOREIGN KEY ("copy_topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deck_subscriptions_pk" ON "deck_subscriptions" USING btree ("user_id","deck_topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deck_subscriptions_deck_idx" ON "deck_subscriptions" USING btree ("deck_topic_id");--> statement-breakpoint

-- Mirror change-capture trigger, matching every other app table.
DROP TRIGGER IF EXISTS "deck_subscriptions__sync_trg" ON "deck_subscriptions";
CREATE TRIGGER "deck_subscriptions__sync_trg" AFTER INSERT OR UPDATE OR DELETE ON "deck_subscriptions" FOR EACH ROW EXECUTE FUNCTION sync_capture_event('id');--> statement-breakpoint

-- RLS: enable and grant the resolved app role full access. Without the policy
-- a write dies inside sync_capture_event while reads keep working — the
-- 2026-09-28 incident class.
DO $$
DECLARE
  t text;
  target_role text;
  tables text[] := ARRAY['deck_subscriptions'];
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
