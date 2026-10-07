-- 0010: mark which cards were generated from topic notes.
-- Additive only: an ADD COLUMN IF NOT EXISTS under cards, defaulting to false
-- so every existing authored and exam-question row keeps reading as authored.
-- Generated quiz cards (from topic notes, written on approval) are the only
-- rows that should be true, and they can be excluded/sorted separately in the
-- picker and the review queue.
--
-- The mirror replicates writes through triggers on the tables themselves, so
-- no trigger changes are needed: the new column rides along with to_jsonb(NEW).

ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "generated" boolean NOT NULL DEFAULT false;
