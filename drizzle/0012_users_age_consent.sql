-- ADD `age_consent` (+ `date_of_birth`) to `users` so the UK GDPR / Age
-- Appropriate Design Code age gate and the guardian-consent flag are real
-- columns rather than an in-memory check.
--
-- `age_consent` is the gate: under the currently configured minimum age of 13,
-- a learner may hold an account only while a parent or guardian has recorded consent. The
-- column is `NOT NULL DEFAULT false` so a fresh row can never be created with
-- the flag turned on by accident.
--
-- `date_of_birth` is the evidence the consent is based on. It is not part of the
-- child's own fields and is cleared on data deletion like every other
-- personal field; it never leaves the account row.
--
-- Idempotent: gated on pg_attribute so a re-run against a migrated database is
-- a no-op and exits 0. Both target databases use ordinary ALTER permissions
-- for the migration operator; no role-specific SQL is needed.

DO $$
DECLARE
  age_consent_added boolean := false;
  date_of_birth_added boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'users'::regclass
      AND attname = 'age_consent'
      AND attnum > 0
      AND NOT attisdropped
  ) THEN
    ALTER TABLE users ADD COLUMN age_consent boolean NOT NULL DEFAULT false;
    age_consent_added := true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'users'::regclass
      AND attname = 'date_of_birth'
      AND attnum > 0
      AND NOT attisdropped
  ) THEN
    ALTER TABLE users ADD COLUMN date_of_birth text;
    date_of_birth_added := true;
  END IF;

  -- Some pre-release databases used Drizzle's inferred camelCase SQL column
  -- names. Preserve those values when creating the canonical snake_case fields.
  IF age_consent_added AND EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'users'::regclass
      AND attname = 'ageConsent'
      AND attnum > 0
      AND NOT attisdropped
  ) THEN
    EXECUTE 'UPDATE users SET age_consent = COALESCE("ageConsent", false)';
  END IF;

  IF date_of_birth_added AND EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'users'::regclass
      AND attname = 'dateOfBirth'
      AND attnum > 0
      AND NOT attisdropped
  ) THEN
    EXECUTE 'UPDATE users SET date_of_birth = "dateOfBirth"';
  END IF;
END $$;
