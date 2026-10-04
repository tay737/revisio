-- Configurable seasons.
--
-- This table replaces the `SEASON_EPOCH_MS` arithmetic that used to derive every
-- season boundary from two constants in `domain/seasons.ts`. An operator can now
-- open a season early, stretch one over a holiday, name it, or override a
-- reward — none of which was possible when the dates were arithmetic.
--
-- SEEDED, NOT EMPTY. The insert below reproduces *exactly* the windows the old
-- arithmetic produced (ninety days from 2026-01-05 UTC, seasons 1–16), so
-- deploying this migration does not move anyone's rank: a learner holding
-- Diamond II in season 4 still holds Diamond II a minute later. The epoch
-- constants remain in `domain/seasons.ts` as the fallback for a table that has
-- been emptied, and as the shape the seed was generated from.
--
-- `state` records operator intent; the dates are the truth. A row marked
-- `active` whose window has already passed is treated as closed by arithmetic
-- regardless, so a forgotten flag cannot leave the app with two live seasons.
--
-- Idempotent throughout, so it can be applied to the primary and to the Neon
-- mirror by hand without a guard on either side.

CREATE TABLE IF NOT EXISTS "seasons" (
  "number" integer PRIMARY KEY,
  "name" text,
  "starts_at" timestamp NOT NULL,
  "ends_at" timestamp NOT NULL,
  "state" text NOT NULL DEFAULT 'draft',
  "rewards" jsonb,
  "note" text,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "seasons_state_check" CHECK ("state" IN ('draft','active','closed')),
  CONSTRAINT "seasons_window_check" CHECK ("ends_at" > "starts_at")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seasons_window_idx" ON "seasons" USING btree ("starts_at","ends_at");--> statement-breakpoint

-- One active season at a time. Enforced as a partial unique index rather than a
-- trigger so it is visible in `\d seasons` and costs nothing at read time: two
-- live seasons would mean two different answers to "what is my rank", which is
-- the one question this feature exists to keep unambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS "seasons_single_active"
  ON "seasons" ((state)) WHERE "state" = 'active';--> statement-breakpoint

-- The seed. `starts_at`/`ends_at` are written with an explicit UTC offset
-- because `timestamp without time zone` drops it, and the whole product defines
-- a season in UTC — a boundary that moved by an hour twice a year would move
-- every learner's season XP with it.
INSERT INTO "seasons" ("number", "starts_at", "ends_at", "state", "note")
SELECT
  n,
  (DATE '2026-01-05' + ((n - 1) * 90))::timestamp,
  (DATE '2026-01-05' + (n * 90))::timestamp,
  CASE WHEN n = 4 THEN 'active' ELSE 'closed' END,
  'Seeded from the SEASON_EPOCH_MS schedule this table replaced.'
FROM generate_series(1, 16) AS n
ON CONFLICT ("number") DO NOTHING;--> statement-breakpoint

-- The mirror's change-capture trigger, matching every other app table. Absent it
-- a season edited in the admin panel would reach the primary and never Neon, so
-- the phone and the web would disagree about when the current season ends.
DROP TRIGGER IF EXISTS "seasons__sync_trg" ON "seasons";
CREATE TRIGGER "seasons__sync_trg"
AFTER INSERT OR UPDATE OR DELETE ON "seasons"
FOR EACH ROW EXECUTE FUNCTION sync_capture_event('number');--> statement-breakpoint

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
    WHERE schemaname = 'public' AND tablename = 'seasons' AND policyname = 'app_full_access'
  ) THEN
    target_role := CASE
      WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'revisio_app') THEN 'revisio_app'
      ELSE current_user
    END;
    EXECUTE format(
      'CREATE POLICY app_full_access ON public.seasons FOR ALL TO %I USING (true) WITH CHECK (true)',
      target_role
    );
  END IF;
END
$$;