---
name: vault-import
description: Import subjects, topics, notes, maths sets, exam papers and exam questions from the user's Obsidian vault into Revisio safely, idempotently, and with exam-accurate marking. Use when the user asks to import content, create subjects/topics/notes, configure maths topics, or add past papers/exam questions.
---

# Vault content import

Import Obsidian vault content into Revisio through **manifests** — declarative subject specs the importer upserts idempotently. Never write content directly to the DB by hand: manifests are re-runnable, reviewable, and versioned.

## When to use

- "Import X from my vault" / "create a subject for X" / "add past papers for X" — anything content-shaped from `~/Documents/College/2026-2027`.
- Adding maths-engine topics or exam-simulator papers/questions for any subject.

## How it works

```
scripts/vault/
  import.ts          importer core + SubjectSpec types + CLI
  papers.ts          vault readers + Obsidian→app markdown cleaner
  content/           per-topic note bodies copied from the vault (plain markdown, no Obsidian syntax)
  manifests/*.ts     one SubjectSpec per file — default export, subjectId is the upsert key
```

```bash
npx tsx scripts/vault/import.ts              # every manifest
npx tsx scripts/vault/import.ts core-maths   # one manifest by file stem
```

## The contract

1. **Deterministic ids are the safety mechanism.** Topic ids like `cm:3.1`, question ids like `tlq:tl-paperB:q17`, paper ids like `cmp:13501-jun22-qp`. Every row is upserted by id — re-runs update in place, never duplicate. Choose a stable prefix per subject and never change it after first import.
2. **Additive-only migration first.** New columns/tables must be `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`. Migration order: write SQL → apply to Supabase → apply to Neon mirror → typecheck → run importer. Never run the importer before its schema exists on the primary.
3. **An existing subject is identified by its DB id, not its name.** Look the id up before writing the manifest (`select id, name from subjects`). The importer's `upsertSubject` updates by id; creating a manifest with a new id for an existing subject *would* create a duplicate. Set `slug` to match the existing slug for zero-downtime imports against the live site.
4. **Clean Obsidian syntax out of content.** The app renderer (src/domain/markdown.ts) supports GFM-ish markdown + $math$ but **not** frontmatter, `> [!callout]` blocks, or `[[wikilinks]]`. `cleanPaperMd()` in papers.ts strips all three; reuse it for every vault-sourced paper. Content files in `scripts/vault/content/` are pre-cleaned by hand.
5. **Exam marking fidelity comes from the mark scheme, not invention.** Per question: `markSchemeMd` = the examiner's award instructions verbatim-condensed; `aoSplit` = the published AO grid; `modelAnswerMd` = built from indicative content; `markingNotesMd` = *how* and *why* marks are earned (the teaching layer); `keywords`+`minPoints` only where auto-marking is honest (point-recall; never for levels-marked 12-markers).
6. **Levels-marked extended questions are displayed, not auto-marked.** Put the band descriptors into `markSchemeMd`, set `qwcMarks: 3`, and leave keywords unset — the result view renders bands for self-assessment. Auto-marking them would be dishonest.
7. **QWC marks display but don't count in maxScore** (by design). The service counts only auto-marked points.

## Manifest checklist

- [ ] Subject id/slug/name/description/mathsEnabled correct (match existing subject if updating).
- [ ] Every topic: deterministic id, position, lessons with **both** `detailedMd` (full note) and `summaryMd` (real summarised revision bullets — not a copy of the detailed note).
- For maths subjects: a `mathSet` per topic pinning concept ids that exist in `src/domain/maths.ts` (`CONCEPT_BY_ID`); run `npx tsx scripts/verify-maths.ts` after adding concepts.
- [ ] Papers: kind/title/board/series/paperCode/contentMd. Beware **`exam_papers_doc_idx`**: (subject, board, series, paperCode, kind) must be unique — two papers sharing a placeholder code (e.g. both Pearson specimen papers = `P00XXXXX`) need a suffix.
- [ ] Questions: refs, marks, `aoSplit` summing to `marks`, mark scheme text, model answer, marking notes, spec refs, keywords where honest.
- [ ] `npx tsc --noEmit` passes (manifests are typechecked against SubjectSpec).
- [ ] Run importer, then SQL-verify: question/paper/lesson counts, `ao_split is not null` on all questions, no duplicate subjects by name, idempotency (re-run → identical counts).

## Cross-referencing existing content (pre-import audit)

Before importing into an existing subject, audit what's there (read-only SQL):
- `detailed_md = summary_md` on lessons → summaries were never written; fix in the manifest's `summaryMd`.
- exam questions missing `ao_split`/`model_answer_md` → candidates for the same treatment.
- topics without `spec_refs` → backfill from the specification.

Report findings to the user before writing the manifest.

## Live-site discipline (site serves students all day)

- Migrations additive-only; nothing renames/drops/constrains existing columns.
- The importer only touches rows whose ids its manifests own. It never deletes.
- Never point local `.env` DATABASE_URL at the Neon mirror (topology inversion — see AGENTS.md).
- The Neon mirror drains via production `/api/v1/sync`; locally the drain hangs on pgbouncer (known issue — drain from production or after deploy).
- After import: verify the live site still serves, then let the sync drain, then spot-check the mirror.
