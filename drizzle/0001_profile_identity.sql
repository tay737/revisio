ALTER TABLE "card_user_states" ALTER COLUMN "due_at" SET DEFAULT 'epoch'::timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_emoji" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_color" text DEFAULT 'ink' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pending_email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_visibility" jsonb DEFAULT '{"name":true,"nickname":true,"bio":true,"subjects":true,"stats":true,"achievements":true}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_idx" ON "users" USING btree ("username");