-- card_user_states.confused_at (F10, "Still confused" flag, decision D9):
-- nullable timestamp set when the learner flags a card as still confusing on
-- the verdict panel, cleared on unflag. One column on an already-replicated
-- table, so capture triggers carry it to the Neon mirror automatically —
-- but per repo convention this file is applied to BOTH databases before the
-- code that reads/writes it deploys.
--
-- Visibility (D9): the flag is the learner's own self-report, visible to the
-- learner (flagged state on re-encounter + insights count) and to teachers
-- through the shared buildInsights aggregation. It feeds an
-- explanation-priority queue later; v1 stores and displays only.

-- `timestamp` (without time zone) to match the table's other timestamp
-- columns (due_at, last_reviewed_at) and the drizzle `timestamp()` mapping.
ALTER TABLE card_user_states ADD COLUMN IF NOT EXISTS confused_at timestamp;
