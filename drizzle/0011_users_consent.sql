-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 0011: CONSENT
--
-- GDPR / UK GDPR: each account now carries an explicit, per-purpose consent
-- record so a controller can prove it asked, what was offered, what was
-- accepted, and when it was last changed. The boolean map is the only thing
-- persisted — the audit summary is derived on demand (consentSummary) and is
-- never stored, because a stored string is a record you have to keep current
-- and a summary that drifted from the truth is worse than none.
--
-- Columns added here are applied to Supabase AND to the Neon mirror by hand.
-- drizzle-kit generate diffs against the live schema: point DATABASE_URL at the
-- primary first, or the generated file can disagree with the mirror.
--
-- The mirror has no `revisio_app` role — it is applied as `neondb_owner`. Both
-- sqlite (local dev) and the mirror are covered by the `IF NOT EXISTS` guards.
-- `consentUpdatedAt` is a timestamp(3) with a `now()` default so a row that
-- existed before this migration is not dropped by a `NOT NULL` default rewrite.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "consent" jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'users'::regclass
      AND attname = 'consentUpdatedAt'
  ) THEN
    ALTER TABLE "users"
      ADD COLUMN "consentUpdatedAt" timestamp(3) DEFAULT now() NOT NULL;
  END IF;
END
$$;

-- Every user who existed before the column landed needs `updatedAt` set; the
-- `DEFAULT now()` already covers rows written after this migration.
DO $$
BEGIN
  UPDATE "users"
  SET "consentUpdatedAt" = now()
  WHERE "consentUpdatedAt" IS NULL;
END
$$;

-- Seed a brand-new account's consent to exactly what the app can serve
-- without a request: only the strictly necessary keys. Nothing is ever written
-- to `consent` for an empty row and then left to drift.
DO $$
BEGIN
  UPDATE "users"
  SET "consent" = '{"essential":true,"preferences":false,"analytics":false,"marketing":false,"notifications":false,"profile":false,"school":false,"research":false}'::jsonb
  WHERE "consent" = '{}'::jsonb;
END
$$;

-- Index the two change-bearing columns so a data-subject request that walks the
-- table to produce an audit trail stays cheap on a big tenant. `consentUpdatedAt`
-- is the browse key; `consent` index is useful if anyone ever points a policy
-- editor at a cohort.
CREATE INDEX IF NOT EXISTS "users_consent_updated_at_idx"
  ON "users" ("consentUpdatedAt" DESC);

-- The consent route only *reads* rows that exist. It never rewrites a row that
-- lacks the column, so the `ALTER ... ADD COLUMN IF NOT EXISTS` above is the
-- whole story for every deployment the app has actually made.
