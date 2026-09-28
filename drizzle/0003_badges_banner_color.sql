-- Profile badges + banner colour (v1.7).
-- Badges are developer-minted chips granted to profiles; banner_color picks
-- the token wash shown when no banner image is uploaded.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banner_color" text NOT NULL DEFAULT 'dusk';

CREATE TABLE IF NOT EXISTS "profile_badges" (
  "id" text PRIMARY KEY,
  "slug" text NOT NULL,
  "label" text NOT NULL,
  "icon" text NOT NULL DEFAULT '',
  "color" text NOT NULL DEFAULT 'gold',
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "profile_badges_slug_idx" ON "profile_badges" ("slug");

CREATE TABLE IF NOT EXISTS "user_profile_badges" (
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "badge_id" text NOT NULL REFERENCES "profile_badges"("id") ON DELETE CASCADE,
  "granted_by" text,
  "granted_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_profile_badges_pk" ON "user_profile_badges" ("user_id", "badge_id");

-- Launch-phase achievements: everyone who used the app during alpha/beta.
-- rule kind 'manual' is never auto-evaluated; they are granted by a developer
-- from the admin panel (or backfilled in bulk while the phase lasts).
INSERT INTO "achievements" ("id", "name", "description", "icon", "rule")
VALUES
  ('alpha-tester', 'Alpha Tester', 'Used Revisio during the private alpha.', '🧪', '{"kind":"manual"}'::jsonb),
  ('beta-tester', 'Beta Tester', 'Used Revisio during the public beta.', '🛠️', '{"kind":"manual"}'::jsonb)
ON CONFLICT ("id") DO NOTHING;
