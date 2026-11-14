-- ADD `education_level` to `users`: the level a learner names at sign-up
-- (GCSE / A-level / IB / University / Other). It is the one signal registration
-- can collect that says what kind of content to surface, and it was the last
-- field in the onboarding rework that had no column behind it.
--
-- Nullable on purpose: staff accounts and every account created before this
-- migration have no level, and "not asked yet" is a real state — never a
-- fabricated default. The API validates the ids against
-- `src/lib/education-levels.ts`; the column is plain text, matching how `role`
-- and `status` are stored.
--
-- Idempotent: gated on pg_attribute so a re-run against a migrated database is a
-- no-op and exits 0. Applies to both the primary and the Neon mirror with plain
-- ALTER permissions; no role-specific SQL is needed (see 0012).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'users'::regclass
      AND attname = 'education_level'
      AND attnum > 0
      AND NOT attisdropped
  ) THEN
    ALTER TABLE users ADD COLUMN education_level text;
  END IF;
END $$;
