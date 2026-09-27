-- Profile media + maths-drill XP.
-- Media: image URLs live on users; the bytes live in Neon's S3-compatible
-- storage. media_assets is the ledger of every object the app ever presigned,
-- so orphaned uploads can be found (and, one day, reaped) without scanning
-- the bucket.
ALTER TABLE "users" ADD COLUMN "avatar_url" text;
ALTER TABLE "users" ADD COLUMN "banner_url" text;

-- No source CHECK constraint exists on xp_events (plain text column), and the
-- drizzle enum lives only in TypeScript. The maths source is declared in
-- schema.ts; nothing to alter in SQL.

CREATE TABLE IF NOT EXISTS "media_assets" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "key" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "media_assets_key_idx" ON "media_assets" ("key");
CREATE INDEX IF NOT EXISTS "media_assets_user_idx" ON "media_assets" ("user_id");
