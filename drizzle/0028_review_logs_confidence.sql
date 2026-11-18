-- review_logs.confidence (F5, product decision D6): the learner's pre-answer
-- self-report — 'knew' | 'guessed' | null. Dedicated nullable column, NOT a
-- jsonb meta bag (verified: review_logs has no meta column).
--
-- v1 stores without acting: confidence does not change grading, XP, SRS
-- intervals or streaks — it is scaffolding for later metacognition features.
-- The column is plain nullable text with no check constraint, matching the
-- table's convention for enum-ish values (mode, rating).
--
-- Replication: review_logs rows replicate to the Neon mirror through the
-- capture triggers' to_jsonb(NEW), so the new column flows automatically —
-- but per repo convention this file is applied to BOTH databases before the
-- code that writes it deploys.

ALTER TABLE review_logs ADD COLUMN IF NOT EXISTS confidence text;
