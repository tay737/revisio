-- DROP `education_level` from `users`.
--
-- The field was collected at sign-up but no feature consumed it, so there was
-- no lawful basis for holding it (UK GDPR Art 5(1)(c) data minimisation). The
-- collection has been removed from the registration flow, the /me payload, the
-- Settings/deletion path and the privacy policy; this migration removes the
-- column itself so the data is no longer stored.
--
-- Idempotent: gated on pg_attribute so a re-run against a migrated database is
-- a no-op and exits 0. Applies to both the primary and the Neon mirror with
-- plain ALTER permissions (no role-specific SQL needed, see 0012).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'users'::regclass
      AND attname = 'education_level'
      AND attnum > 0
      AND NOT attisdropped
  ) THEN
    ALTER TABLE users DROP COLUMN education_level;
  END IF;
END $$;