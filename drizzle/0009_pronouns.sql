-- Pronouns on the public profile.
--
-- One nullable text column plus one more key in the `profile_visibility` map.
-- There is deliberately no enum and no lookup table: a fixed list of allowed
-- values would have to be extended by a migration and a deploy every time
-- someone needed a set the product had not heard of, which is precisely the
-- failure this feature exists to avoid. The shortlist of chips in Settings is a
-- convenience in `lib/pronouns.ts`, not the schema's opinion.
--
-- `profile_visibility` already treats an absent key as "default", so the
-- column default below only affects rows created from here on. Existing rows
-- keep their stored map and pick up `"pronouns": true` the moment
-- `getPublicProfile` merges `DEFAULT_VISIBILITY` over it — the same path every
-- other field has always taken, so nothing needs a backfill.
--
-- The CHECK is the server-side half of `lib/pronouns.ts`: a non-empty value
-- that fits the cap. Whitespace-only strings are stopped by `btrim`, so " " can
-- never be stored as if the learner had set pronouns.
--
-- Idempotent, and safe to apply to both the primary and the Neon mirror — the
-- mirror needs the column too, or `sync`'s upsert (which only writes columns
-- the *target* has) would silently drop pronouns from every replicated row.
--
-- Applied to both databases by hand, like 0007 and 0008; `npm run neon:bootstrap`
-- covers a fresh mirror.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pronouns" text;
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_pronouns_len";
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_pronouns_len"
  CHECK ("pronouns" IS NULL OR char_length(btrim("pronouns")) BETWEEN 1 AND 40);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "profile_visibility" SET DEFAULT
  '{"name":true,"nickname":true,"bio":true,"pronouns":true,"subjects":true,"stats":true,"achievements":true}'::jsonb;