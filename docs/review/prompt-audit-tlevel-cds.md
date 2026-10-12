# Prompt audit — T-Level Digital Support & Security existing questions

**Scope:** audit of the existing *prompt text* (the text the student reads) on the
specimen-exam questions already in the app for the T-Level CDS subject,
`cb8050d4-13bc-4d40-b926-633c1b0282e6` (tlevel-cyber.ts → `tl:paperA` / `tl:paperB`).

**Rule applied (from the user):** keep each question's kind, answer, mark scheme,
AO split, keywords/minPoints and marks intact. Only rewrite the *prompt* — the
readable cue — where it is currently awkward, wordy, ambiguous, or reads as the
mark scheme rather than a question. No new content. No kind moves.

---

## What the existing set looks like

- 55 specimen questions (Paper A 1–22, Paper B 1–33) on `exam_questions`,
  board = `Pearson (NCFE)`. All carry AO splits; the short point-recall ones
  also carry keyword rules.
- Tone is generally good — most are faithful transcriptions of the specimen
  paper's wording, which is exactly what exam-fidelity questions should be.
- The audit therefore targets the *presentation* of the prompt, not the
  content. The specimen wording is trustworthy; my changes are to clarity and
  cue-ness, never to what is being asked.

## Findings (prompt-only, kind/answer/mark scheme preserved)

### 1. Prompts that already read well — leave alone

These are clean as-is and should not be touched. The specimen wording is the
best cue for these:

- `tlq:tl-paperA:q1` — "Describe **one** action that could reduce this risk."
  Clean, mark count in the prompt. No change.
- `tlq:tl-paperA:q9` — "Explain **two** ways poor internet connection could have
  an adverse effect on Jane's business." Clean scenario cue. No change.
- `tlq:tl-paperA:q11` — "State which piece of UK legislation … and briefly
  describe why it might breach that legislation." Good two-part cue. No change.
- `tlq:tl-paperA:q17` — "State **one** advantage and **one** disadvantage of
  using user forums …" Clean. No change.
- `tlq:tl-paperB:q9` — "Identify **two** project management methods …" Clean
  recall cue. No change.
- `tlq:tl-paperB:q16` — "State **one** industry standard that must be considered
  when processing card payments." Clean one-mark cue. No change.

### 2. Prompts that are fine but could be tightened — optional polish

These work but read slightly heavy or repeat the mark-scheme framing in the cue.
If an editor wants a cleaner read, trim to the question the student must answer
and drop the "…" exposition that belongs in the stem or the mark scheme.

- `tlq:tl-paperA:q2` — currently restates the whole sampling scenario before
  the actual task ("Work out the number of male students aged 19+ that should be
  in the sample."). The scenario table is fine to keep; the lead-in can be
  shortened to put the task first and let the table follow. Keep the table;
  keep the task line.
- `tlq:tl-paperA:q10` — "Select the number of the correct description for each
  of the below" is a slightly idiosyncratic specimen instruction. For a study
  card it can read more directly as "Match each device to the correct
  description" — same task, friendlier cue. The options/table stay.
- `tlq:tl-paperB:q11` — the table of campaign statistics is long and the task
  ("Explain **one** way … the company can use the statistics to target new
  customers") is clear; the lead-in before the table can be trimmed so the table
  and the task are the focus. Keep the table; keep the task.

### 3. Prompts where the cue currently drifts toward the mark scheme —
rewrite the prompt to ask the question cleanly

These are the prompts where the visible text leans into "how marks are earned"
language instead of stating the student's task crisply. The mark scheme stays
exactly as-is; only the prompt changes.

- `tlq:tl-paperA:q3` / `q4` / `q5` / `q6` / `q7` — these are scenario
  "Describe/Discuss" prompts with mark-scheme-style bullet hints embedded in the
  cue in some renderings. Keep the scenario; state the task ("Describe four
  possible impacts…", "Discuss four ways…") as the only instruction in the cue,
  so the card reads as a question and the mark-scheme bullets remain the
  examiner's award guidance, not part of the question.
- `tlq:tl-paperA:q8` / `q15` / `tlq:tl-paperB:q5` / `q6` / `q7` / `q8` /
  `q12` / `q14` / `q15` — extended "Discuss/Explain/Describe" prompts. These
  are genuinely exam-shaped and should mostly stay specimen-faithful; the only
  cue change is to make sure the task sentence (the "Discuss … [N] ways …"
  line) is unmistakably the question and the preceding scenario is clearly the
  stem. In a couple, the cue currently repeats the "applied to the scenario"
  instruction that belongs in the marking notes — pull that back out of the
  prompt and into the notes, so the prompt is just the question.
- `tlq:tl-paperB:q1` / `q2` / `q3` / `q4` — short AO1/AO2 "Describe …" prompts.
  These are already clean; no rewrite needed beyond making sure the task word
  ("Describe two reasons…", "Describe three routes…") is the visible instruction.

### 4. Prompts where the cue reads as an instruction to the marker rather than
the student — rewrite to a student-facing question

- Any prompt whose visible text currently says things like "Award one mark for…",
  "Accept any other suitable response" or "one mark for each description" should
  not carry that language in the question the student sees. That language belongs
  in `markSchemeMd` / `markingNotesMd`. The prompt should be the question only.
  (This is more an audit flag than a large count — the existing set mostly keeps
  these separate already; the ones that don't are the "Describe …" prompts where
  the "for example" list has leaked into the cue.)

### 5. No changes recommended for mark-scheme-only fields

For every question above, leave untouched: `marks`, `aoSplit`, `markSchemeMd`,
`modelAnswerMd`, `markingNotesMd`, `keywords`, `minPoints`, `questionRef`,
`specRefs`, `kind`, `options`/`correctIdx` (for mcq). The audit is prompt text
only.

---

## Recommended next action (through the panel, not this file)

For each question flagged in §2 and §3, open it from the topic's question list
in the library/content manager and rewrite only the visible prompt field
(`question_md` for exam questions; for the cloze/flashcard near-miss cases the
audit would flag the prompt text column — but the T-Level exam set is
`exam_questions` so the visible cue is `question_md`). Keep every other field as
it is now. Re-read the prompt after the edit from a student's point of view: "do
I know what I'm being asked to produce?" If yes, stop.

## Notes on the five missing topics (added separately)

The new topics below (4.2.1, 4.2.3, 7.3.1, 7.3.2, 7.3.3) are created with notes
drawn from the vault and a handful of prompt-clean questions. The questions I add
for them are written to the §1/§2 standard — clean cues, mark-scheme language kept
in the notes, not the prompt — so the audit rule above is applied to the new
content at the point of creation rather than retrofitted.
