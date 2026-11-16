-- Acquisition (#20): peer referral codes and redemptions.
--
-- Idempotent throughout: safe to apply to the Supabase primary and the Neon
-- mirror by hand. RLS policies resolve the app role instead of hardcoding
-- `revisio_app`, which does not exist on the mirror (see drizzle/0006).

CREATE TABLE IF NOT EXISTS "referral_codes" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "code" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "rotated_at" timestamp,
  CONSTRAINT "referral_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "referral_codes_user_idx" ON "referral_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "referral_codes_code_idx" ON "referral_codes" USING btree ("code");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "referral_redemptions" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "referrer_user_id" text NOT NULL,
  "referred_user_id" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "referral_redemptions_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "referral_redemptions_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "referral_redemptions_referred_idx" ON "referral_redemptions" USING btree ("referred_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_redemptions_referrer_idx" ON "referral_redemptions" USING btree ("referrer_user_id","created_at");--> statement-breakpoint

-- Mirror change-capture triggers, matching every other app table.
DROP TRIGGER IF EXISTS "referral_codes__sync_trg" ON "referral_codes";
CREATE TRIGGER "referral_codes__sync_trg" AFTER INSERT OR UPDATE OR DELETE ON "referral_codes" FOR EACH ROW EXECUTE FUNCTION sync_capture_event('id');--> statement-breakpoint
DROP TRIGGER IF EXISTS "referral_redemptions__sync_trg" ON "referral_redemptions";
CREATE TRIGGER "referral_redemptions__sync_trg" AFTER INSERT OR UPDATE OR DELETE ON "referral_redemptions" FOR EACH ROW EXECUTE FUNCTION sync_capture_event('id');--> statement-breakpoint

-- RLS: enable on every new table and grant the resolved app role full access.
-- Without the policy a write dies inside sync_capture_event while reads keep
-- working — the 2026-09-28 incident class.
DO $$
DECLARE
  t text;
  target_role text;
  tables text[] := ARRAY['referral_codes','referral_redemptions'];
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
