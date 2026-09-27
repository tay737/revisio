-- Maths practice engine (standalone tool, outside the SRS).
-- Apply to the primary DATABASE_URL; in this deployment the primary is Neon
-- production, so one apply covers it. Rows replicate through _sync_events
-- once the triggers cover math_sets (re-run `npm run neon:init` where a
-- separate mirror exists).

ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "maths_enabled" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "math_sets" (
  "id" text PRIMARY KEY,
  "topic_id" text NOT NULL REFERENCES "topics"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "concepts" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "default_count" integer NOT NULL DEFAULT 10,
  "default_difficulty" text NOT NULL DEFAULT 'mixed',
  "owner_id" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "math_sets_topic_idx" ON "math_sets" ("topic_id");
