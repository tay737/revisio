/**
 * Vault content importer — subjects, topics, notes, maths sets, exam papers
 * and exam questions from structured manifests, idempotently.
 *
 * Run:  npx tsx scripts/vault/import.ts [manifest-name…]
 *   with no arguments, every manifest in scripts/vault/manifests/*.ts runs.
 *   A manifest name is its file stem, e.g. `core-maths` for core-maths.ts.
 *
 * Idempotency contract (this is what makes re-runs safe against a live
 * database): every row is keyed by a *deterministic* id — `cm:3.1` for topics,
 * `cmq:13501-jun22:q2b` for exam questions — and writes are upserts on that
 * id. Re-running a manifest updates its own rows in place and touches nothing
 * else: no duplicates, no orphaned content, no second subject with the same
 * name. Rows the manifest no longer lists are left alone (import is additive;
 * removal is a deliberate human act through the app).
 *
 * Question marking fidelity comes from the mark scheme, not from guesswork:
 * each question carries its mark-scheme text, a model answer, an AO split,
 * and keyword rules the auto-marker grades against. mcq questions carry
 * options + correctIdx; free_response questions carry keywords/minPoints so
 * `gradeFlashcard` awards half-marks for partial coverage.
 */
import 'dotenv/config';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '../../src/db/client';
import {
  examPapers, examQuestions, lessons, mathSets, subjects, topics,
} from '../../src/db/schema';

// ── manifest types ──────────────────────────────────────────────────────────

export type LessonSpec = {
  /** Deterministic lesson id, e.g. "cm:3.1:detailed". */
  id: string;
  title: string;
  detailedMd: string;
  summaryMd: string;
  specRefs: string;
};

export type TopicSpec = {
  /** Deterministic topic id, e.g. "cm:3.1". */
  id: string;
  name: string;
  description: string;
  position: number;
  /** Papers/topics these questions sit under. */
  lessons: LessonSpec[];
  /** Maths practice set pinned to this topic (optional). */
  mathSet?: {
    id: string;
    title: string;
    description: string;
    /** Concept ids from domain/maths.ts. */
    concepts: string[];
    defaultCount?: number;
    defaultDifficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
  };
};

export type QuestionSpec = {
  /** Deterministic question id, e.g. "cmq:13501-jun22:q2b". */
  id: string;
  /** Topic the question hangs from. */
  topicId: string;
  questionRef: string;
  questionMd: string;
  marks: number;
  /** Examiner's marking instructions — shown with the result. */
  markSchemeMd: string;
  /** A model answer to compare against — shown with the result. */
  modelAnswerMd?: string;
  /** How the marks are earned, in prose — shown with the result. */
  markingNotesMd?: string;
  /** AO split, e.g. [{ao: 'AO1', marks: 2}]. */
  aoSplit?: { ao: string; marks: number }[];
  qwcMarks?: number;
  specRefs?: string;
  /** mcq with options + correctIdx, else free_response. */
  kind?: 'mcq' | 'free_response';
  options?: string[];
  correctIdx?: number;
  /** Keyword marking for free_response: required points and optional extras. */
  keywords?: { required: boolean; phrase: string; synonyms?: string[] }[];
  minPoints?: number;
  sourceYear?: number;
  board?: string;
};

export type PaperSpec = {
  /** Deterministic paper id, e.g. "cmp:13501-jun22-qp". */
  id: string;
  kind: 'question_paper' | 'mark_scheme' | 'formulae_sheet' | 'other';
  title: string;
  board: string;
  series: string;
  paperCode: string;
  totalMarks?: number;
  durationMinutes?: number;
  contentMd: string;
};

export type SubjectSpec = {
  /** Deterministic subject id, e.g. "core-maths". */
  id: string;
  name: string;
  slug: string;
  description: string;
  /** Maths practice on for this subject? */
  mathsEnabled?: boolean;
  topics: TopicSpec[];
  papers: PaperSpec[];
  questions: QuestionSpec[];
};

// ── idempotent upserts ──────────────────────────────────────────────────────

async function upsertSubject(spec: SubjectSpec): Promise<string> {
  const [existing] = await db.select().from(subjects).where(eq(subjects.id, spec.id)).limit(1);
  if (existing) {
    await db
      .update(subjects)
      .set({ name: spec.name, description: spec.description, mathsEnabled: spec.mathsEnabled ?? existing.mathsEnabled })
      .where(eq(subjects.id, spec.id));
    return existing.id;
  }
  await db.insert(subjects).values({
    id: spec.id,
    name: spec.name,
    slug: spec.slug,
    description: spec.description,
    mathsEnabled: spec.mathsEnabled ?? false,
    ownerId: null,
  });
  return spec.id;
}

async function upsertTopic(subjectId: string, t: TopicSpec): Promise<string> {
  const [existing] = await db.select().from(topics).where(eq(topics.id, t.id)).limit(1);
  if (existing) {
    await db
      .update(topics)
      .set({ name: t.name, description: t.description, position: t.position })
      .where(eq(topics.id, t.id));
    return t.id;
  }
  await db.insert(topics).values({
    id: t.id,
    subjectId,
    name: t.name,
    slug: t.id, // deterministic; the unique index is on slug
    description: t.description,
    visibility: 'public',
    ownerId: null,
    position: t.position,
  });
  return t.id;
}

async function upsertLessons(topicId: string, lessonSpecs: LessonSpec[]): Promise<number> {
  let written = 0;
  for (const [i, l] of lessonSpecs.entries()) {
    const [existing] = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.id, l.id)).limit(1);
    if (existing) {
      await db
        .update(lessons)
        .set({ title: l.title, detailedMd: l.detailedMd, summaryMd: l.summaryMd, specRefs: l.specRefs, position: i })
        .where(eq(lessons.id, l.id));
    } else {
      await db.insert(lessons).values({
        id: l.id,
        topicId,
        title: l.title,
        detailedMd: l.detailedMd,
        summaryMd: l.summaryMd,
        specRefs: l.specRefs,
        visibility: 'public',
        ownerId: null,
        position: i,
      });
    }
    written += 1;
  }
  return written;
}

async function upsertMathSet(topicId: string, set: NonNullable<TopicSpec['mathSet']>): Promise<void> {
  const [existing] = await db.select().from(mathSets).where(eq(mathSets.id, set.id)).limit(1);
  const values = {
    topicId,
    title: set.title,
    description: set.description,
    concepts: set.concepts,
    defaultCount: set.defaultCount ?? 10,
    defaultDifficulty: set.defaultDifficulty ?? 'mixed' as const,
  };
  if (existing) {
    await db.update(mathSets).set(values).where(eq(mathSets.id, set.id));
  } else {
    await db.insert(mathSets).values({ id: set.id, ...values, ownerId: null });
  }
}

async function upsertPapers(subjectId: string, paperSpecs: PaperSpec[]): Promise<number> {
  let written = 0;
  for (const p of paperSpecs) {
    const [existing] = await db.select({ id: examPapers.id }).from(examPapers).where(eq(examPapers.id, p.id)).limit(1);
    if (existing) {
      await db
        .update(examPapers)
        .set({
          title: p.title, kind: p.kind, board: p.board, series: p.series, paperCode: p.paperCode,
          totalMarks: p.totalMarks ?? null, durationMinutes: p.durationMinutes ?? null, contentMd: p.contentMd,
        })
        .where(eq(examPapers.id, p.id));
    } else {
      await db.insert(examPapers).values({
        id: p.id,
        subjectId,
        title: p.title,
        kind: p.kind,
        board: p.board,
        series: p.series,
        paperCode: p.paperCode,
        totalMarks: p.totalMarks ?? null,
        durationMinutes: p.durationMinutes ?? null,
        contentMd: p.contentMd,
        visibility: 'public',
        ownerId: null,
      });
    }
    written += 1;
  }
  return written;
}

async function upsertQuestions(questionSpecs: QuestionSpec[]): Promise<number> {
  let written = 0;
  for (const q of questionSpecs) {
    const isMcq = q.kind === 'mcq';
    if (isMcq && (!q.options || q.correctIdx === undefined)) {
      throw new Error(`import: mcq question ${q.id} needs options and correctIdx`);
    }
    const values = {
      topicId: q.topicId,
      questionMd: q.questionMd,
      markSchemeMd: q.markSchemeMd,
      modelAnswerMd: q.modelAnswerMd ?? '',
      markingNotesMd: q.markingNotesMd ?? '',
      kind: (isMcq ? 'mcq' : 'free_response') as 'mcq' | 'free_response',
      options: isMcq ? (q.options ?? []).map((text, i) => ({ id: `o${i}`, text })) : null,
      correctOptionId: isMcq ? `o${q.correctIdx ?? 0}` : null,
      keywords: q.keywords ?? null,
      minPoints: q.minPoints ?? null,
      marks: q.marks,
      aoSplit: q.aoSplit ?? null,
      qwcMarks: q.qwcMarks ?? 0,
      questionRef: q.questionRef,
      specRefs: q.specRefs ?? '',
      sourceYear: q.sourceYear ?? null,
      board: q.board ?? '',
      visibility: 'public' as const,
    };
    const [existing] = await db.select({ id: examQuestions.id }).from(examQuestions).where(eq(examQuestions.id, q.id)).limit(1);
    if (existing) {
      await db.update(examQuestions).set(values).where(eq(examQuestions.id, q.id));
    } else {
      await db.insert(examQuestions).values({ id: q.id, ...values, ownerId: null });
    }
    written += 1;
  }
  return written;
}

// ── the run ─────────────────────────────────────────────────────────────────

export async function importSubject(spec: SubjectSpec): Promise<Record<string, number>> {
  const subjectId = await upsertSubject(spec);
  let lessonCount = 0;
  let setCount = 0;
  for (const t of spec.topics) {
    await upsertTopic(subjectId, t);
    lessonCount += await upsertLessons(t.id, t.lessons);
    if (t.mathSet) {
      await upsertMathSet(t.id, t.mathSet);
      setCount += 1;
    }
  }
  const paperCount = await upsertPapers(subjectId, spec.papers);
  const questionCount = await upsertQuestions(spec.questions);
  return { topics: spec.topics.length, lessons: lessonCount, mathSets: setCount, papers: paperCount, questions: questionCount };
}

/** Load manifests: named ones, or every manifest in the directory. */
function manifestPaths(names: string[]): string[] {
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'manifests');
  const all = readdirSync(dir).filter((f) => f.endsWith('.ts')).sort();
  if (names.length === 0) return all.map((f) => join(dir, f));
  return names.map((n) => {
    const file = n.endsWith('.ts') ? n : `${n}.ts`;
    if (!all.includes(file)) throw new Error(`import: no manifest "${file}" in scripts/vault/manifests`);
    return join(dir, file);
  });
}

async function main() {
  const names = process.argv.slice(2);
  const paths = manifestPaths(names);
  for (const path of paths) {
    const mod = await import(path);
    const spec: SubjectSpec = mod.default;
    if (!spec?.id || !spec?.name) throw new Error(`import: ${path} must default-export a SubjectSpec`);
    const counts = await importSubject(spec);
    console.log(`✓ ${spec.name}: ${counts.topics} topics, ${counts.lessons} lessons, ${counts.mathSets} maths sets, ${counts.papers} papers, ${counts.questions} exam questions`);
  }
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/vault/import.ts');
if (invokedDirectly) {
  main()
    .then(() => closeDb().then(() => process.exit(0)))
    .catch(async (e) => {
      console.error(e);
      await closeDb();
      process.exit(1);
    });
}
