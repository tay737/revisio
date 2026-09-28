-- 0004: exam paper documents + exam-question fidelity columns.
-- Additive only: every statement is CREATE TABLE / ADD COLUMN IF NOT EXISTS, so
-- it is safe to run against a live database mid-flight — existing reads and
-- writes continue unchanged, and old rows simply read NULL / ''.

-- ── Stored past papers, mark schemes and formulae sheets ───────────────────
CREATE TABLE IF NOT EXISTS exam_papers (
  id text PRIMARY KEY,
  subject_id text NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'question_paper',
  board text NOT NULL DEFAULT '',
  series text NOT NULL DEFAULT '',
  paper_code text NOT NULL DEFAULT '',
  total_marks integer,
  duration_minutes integer,
  content_md text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'public',
  owner_id text,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT exam_papers_kind_check CHECK (kind IN ('question_paper','mark_scheme','formulae_sheet','other')),
  CONSTRAINT exam_papers_visibility_check CHECK (visibility IN ('public','private'))
);
CREATE INDEX IF NOT EXISTS exam_papers_subject_idx ON exam_papers (subject_id);
-- Re-importing a paper updates the stored copy instead of stacking duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS exam_papers_doc_idx
  ON exam_papers (subject_id, board, series, paper_code, kind);

-- ── Per-question exam-board fidelity ───────────────────────────────────────
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS ao_split jsonb;
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS model_answer_md text NOT NULL DEFAULT '';
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS marking_notes_md text NOT NULL DEFAULT '';
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS qwc_marks integer;
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS paper_id text;
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS question_ref text NOT NULL DEFAULT '';
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS spec_refs text NOT NULL DEFAULT '';

-- The mirror replicates writes through triggers on the tables themselves, so
-- no trigger changes are needed: new columns ride along with to_jsonb(NEW).
