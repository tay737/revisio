-- Season one is the only season that has ever happened.
--
-- `0007_seasons.sql` seeded sixteen windows from the old `SEASON_EPOCH_MS`
-- arithmetic, seasons 1–3 of which closed months before the product had a
-- single learner. That was wrong in two directions at once:
--
--   1. THE NUMBERING WAS A LIE. The app opened "Season 4" on its first day,
--      because the seed inherited an epoch from January 2026 that predated the
--      product by eight months. There has been exactly one season.
--   2. IT MANUFACTURED A RESULT. `GET /api/v1/seasons` backfills closed seasons
--      on read, so it correctly derived "Tay finished season 3 on Gold I with
--      1,555 RP across 366 reviews" — from reviews that all happened inside the
--      real current season, misfiled into a window that never ran. That row is
--      on a learner's permanent showcase and awards a Gold reward for a season
--      that did not exist.
--
-- So: one row, opening on the day of the first XP event in the database, with
-- every learner's history inside the window. That is also the answer to "the
-- past total RP should be the value for the current season" — the window starts
-- before any history, so season XP *is* lifetime XP, with no offset to reason
-- about.
--
-- `grandfather_rp` makes that an explicit property of the season rather than an
-- accident of the dates, so an operator who later edits the start date does not
-- silently strip a year of everyone's rank.
--
-- Idempotent, and safe to apply to both databases.

ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "grandfather_rp" boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- Delete the rows for seasons that never ran.
DELETE FROM "seasons" WHERE number <> 1;--> statement-breakpoint

-- Then any result claimed for a window that no longer exists. **After** the
-- delete above, deliberately: the earlier version of this migration swept the
-- results first, at which point season 3 was still a row and therefore still
-- "existed", so Tay's manufactured Gold result survived the run that was
-- supposed to remove it. The predicate is order-dependent on the seasons table,
-- which is exactly the sort of thing that should be a comment here.
DELETE FROM "season_results" r
WHERE NOT EXISTS (SELECT 1 FROM "seasons" s WHERE s.number = r.season_number);--> statement-breakpoint

-- Season 1: opens the day of the first XP event ever recorded (2026-09-25,
-- 17:42 UTC — rounded down to midnight so the whole of that day is inside it)
-- and runs the ninety days the design specifies.
UPDATE "seasons"
SET
  "name" = NULL,
  "starts_at" = TIMESTAMP '2026-09-25 00:00:00',
  "ends_at" = TIMESTAMP '2026-12-24 00:00:00',
  "state" = 'active',
  "grandfather_rp" = true,
  "rewards" = NULL,
  "note" = 'The first season. Opens on the first day any learner earned XP; grandfathered so the whole of everyone''s history counts toward it.',
  "updated_at" = now()
WHERE "number" = 1;--> statement-breakpoint

-- The backfill can only write a result for a season whose window has closed.
-- With a single live row there is nothing to backfill, but a learner who
-- arrives with no history should still see a coherent empty season rather than
-- an error, so the constraint is left in place and simply has nothing to do.
DO $$
DECLARE
  live_count integer;
BEGIN
  SELECT count(*) INTO live_count FROM "seasons" WHERE "state" = 'active';
  IF live_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one active season, found %', live_count;
  END IF;
END
$$;