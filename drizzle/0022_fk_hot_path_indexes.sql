-- #53 index migration: FK coverage + profile-handle expression indexes.
--
-- Idempotent throughout: safe to apply to the Supabase primary and the Neon
-- mirror by hand. No role literals — the Neon mirror has no `revisio_app`.
--
-- IMPORTANT: every statement is CREATE INDEX CONCURRENTLY, which cannot run
-- inside a transaction block. Apply with `psql -f` (autocommit) on EACH
-- database, not through a transactional migration runner. After applying,
-- verify pg_index.indisvalid for every name below and re-run on any that are
-- invalid (IF NOT EXISTS will skip a valid index but also skip recreating an
-- invalid one — drop invalid indexes first if a build was interrupted).
--
-- Scope: the 20 app FK columns that lacked a leading index (ordered by hot
-- path in docs/DB-INDEX-ADDENDUM-2026-11-16.md), plus the two users expression
-- indexes that make /u/<handle> lookup indexable without a seq scan. The
-- visibility/enrolment partial-index candidates and review_logs correctness
-- partials stay deferred until representative-volume EXPLAIN justifies them.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "card_user_states_card_id_idx" ON "card_user_states" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "class_memberships_user_id_class_id_idx" ON "class_memberships" USING btree ("user_id","class_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_topic_states_topic_id_idx" ON "user_topic_states" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "classes_teacher_id_idx" ON "classes" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "classes_subject_id_idx" ON "classes" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "class_assignments_topic_id_idx" ON "class_assignments" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "imports_user_id_idx" ON "imports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "exam_attempts_user_created_idx" ON "exam_attempts" USING btree ("user_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "exam_plans_subject_id_idx" ON "exam_plans" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "cram_sessions_user_id_idx" ON "cram_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "approval_requests_user_id_idx" ON "approval_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "email_tokens_user_id_idx" ON "email_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "deck_subscriptions_copy_topic_idx" ON "deck_subscriptions" USING btree ("copy_topic_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_subjects_subject_id_idx" ON "user_subjects" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "class_assignments_created_by_idx" ON "class_assignments" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_achievements_achievement_id_idx" ON "user_achievements" USING btree ("achievement_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_profile_badges_badge_id_idx" ON "user_profile_badges" USING btree ("badge_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ai_drafts_target_topic_idx" ON "ai_drafts" USING btree ("target_topic_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ai_drafts_decided_by_idx" ON "ai_drafts" USING btree ("decided_by");--> statement-breakpoint

-- Profile handle lookup (src/services/profile.ts getPublicProfile) filters on
-- lower(username) = h OR id = h. users is small today, but the OR-of-lower
-- predicate seq-scans and will not improve with row count; this expression
-- index lets Postgres use the lower(username) arm instead of seq-scanning.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_lower_username_idx" ON "users" USING btree (lower("username"));
