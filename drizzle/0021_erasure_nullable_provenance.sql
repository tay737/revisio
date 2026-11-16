-- DPO erasure ruling: teacher/creator provenance columns become nullable so
-- account erasure can strip attribution without deleting shared class content.
-- Idempotent; safe on both Supabase and Neon. APPLY TO BOTH DATABASES BEFORE
-- THE CODE DEPLOYS.

ALTER TABLE classes ALTER COLUMN teacher_id DROP NOT NULL;
ALTER TABLE class_assignments ALTER COLUMN created_by DROP NOT NULL;
