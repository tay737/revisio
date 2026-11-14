-- 0014_media_assets_delete_failed.sql
--
-- Account deletion removes uploaded avatar and banner objects from the bucket.
-- A bucket error used to be logged and forgotten, which told the learner the
-- image was gone when it was not. The marker below turns the media ledger into
-- the reconciliation queue: a row with `delete_failed_at` set names a file that
-- still exists because its delete failed, so a retry job can find it without a
-- second table or a guess about what is missing.
--
-- Nullable and additive: existing rows keep meaning "current", and the app
-- reads the column only on the erasure path. Idempotent, gated on pg_attribute
-- like 0011/0012/0013, so a re-run is a no-op.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'media_assets'::regclass
      AND attname = 'delete_failed_at'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE media_assets ADD COLUMN delete_failed_at timestamptz;
  END IF;
END
$$;
