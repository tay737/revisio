-- Seasonal ranks: what a learner finished a season on.
--
-- The season *windows* are derived (src/domain/seasons.ts — ninety days from a
-- fixed epoch), so this table only records outcomes: one row per (user,
-- season), written when the season closes and never rewritten except to stamp
-- `reward_claimed_at`.
--
-- `final_tier` is a plain-text column with a CHECK rather than a Postgres enum:
-- the ladder now has ten tiers and adding an eleventh must be a code change in
-- domain/ranked.ts, not an ALTER TYPE that has to run before the app boots.
--
-- Idempotent throughout, so it can be applied to the primary and to the Neon
-- mirror by hand without a guard on either side.

CREATE TABLE IF NOT EXISTS "season_results" (
  "user_id" text NOT NULL,
  "season_number" integer NOT NULL,
  "final_tier" text NOT NULL,
  "final_division" integer NOT NULL,
  "final_rank_index" integer NOT NULL,
  "final_rp" integer NOT NULL DEFAULT 0,
  "reviews" integer NOT NULL DEFAULT 0,
  "reward_id" text NOT NULL DEFAULT '',
  "reward_claimed_at" timestamp,
  "ended_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "season_results_tier_check" CHECK (
    "final_tier" IN ('bronze','silver','gold','platinum','emerald','sapphire','diamond','ruby','obsidian','legend')
  ),
  CONSTRAINT "season_results_division_check" CHECK ("final_division" IN (1, 2, 3))
);--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'season_results_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "season_results"
      ADD CONSTRAINT "season_results_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "season_results_pk" ON "season_results" USING btree ("user_id","season_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "season_results_season_idx" ON "season_results" USING btree ("season_number","final_rank_index");--> statement-breakpoint

-- The mirror's change-capture trigger, matching every other app table. Absent
-- it a season result would be written to the primary and never reach Neon, so
-- the progress page would lose the showcase the moment a read failed over.
DROP TRIGGER IF EXISTS "season_results__sync_trg" ON "season_results";
CREATE TRIGGER "season_results__sync_trg"
AFTER INSERT OR UPDATE OR DELETE ON "season_results"
FOR EACH ROW EXECUTE FUNCTION sync_capture_event('user_id,season_number');--> statement-breakpoint

-- Same incident class as drizzle/0005_rls_app_role_policies.sql: a table added
-- after the blanket RLS sweep inherits row security with no policy, and every
-- write then dies inside the capture trigger while every read still succeeds.
--
-- The role is resolved rather than hardcoded: the primary has `revisio_app`, but
-- the Neon mirror has no such role at all and is applied as `neondb_owner`, so
-- a literal `TO revisio_app` aborts the migration there and leaves the mirror
-- half-migrated.
DO $$
DECLARE
  target_role text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'season_results' AND policyname = 'app_full_access'
  ) THEN
    target_role := CASE
      WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'revisio_app') THEN 'revisio_app'
      ELSE current_user
    END;
    EXECUTE format(
      'CREATE POLICY app_full_access ON public.season_results FOR ALL TO %I USING (true) WITH CHECK (true)',
      target_role
    );
  END IF;
END
$$;