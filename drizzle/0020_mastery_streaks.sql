-- #8 mastery streak: opt-in parallel streak on `streaks`.
-- Idempotent; `streaks` is already in the sync trigger list, so the new
-- columns replicate via to_jsonb(NEW) with no extra work. RLS policies on the
-- table already cover all columns.

ALTER TABLE streaks ADD COLUMN IF NOT EXISTS mastery_current integer NOT NULL DEFAULT 0;
ALTER TABLE streaks ADD COLUMN IF NOT EXISTS mastery_best integer NOT NULL DEFAULT 0;
ALTER TABLE streaks ADD COLUMN IF NOT EXISTS mastery_last_active_date text;
