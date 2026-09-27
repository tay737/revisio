import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { mathSets, subjects, topics } from '@/db/schema';
import { ApiError, type SessionUser } from '@/services/api';
import { canManageContent } from '@/services/roles';
import { topicReaches } from '@/services/visibility';
import {
  CONCEPT_BY_ID,
  DIFFICULTIES,
  buildDraft,
  buildQuestion,
  conceptMarks,
  dealQuestions,
  makeRng,
  markAnswer,
  parseQuestionId,
  type Difficulty,
  type Rng,
} from '@/domain/maths';

// ── Maths practice ──────────────────────────────────────────────────────────
// A standalone practice tool, deliberately outside the SRS: nothing here
// writes review logs, moves a schedule or awards XP. A session exists only as
// ids in the client; the server marks each answer by re-deriving the question
// from its id, so there is no server-side session state to expire or lose.
//
// Access rule: a student may practise a topic the moment it reaches them
// (visibility.ts is the one owner of that), inside a subject whose owner has
// switched maths practice on. Staff author sets for any topic they may edit.

async function assertSubjectMathsEnabled(subjectId: string): Promise<void> {
  const [subject] = await db.select({ mathsEnabled: subjects.mathsEnabled }).from(subjects).where(eq(subjects.id, subjectId)).limit(1);
  if (!subject) throw new ApiError(404, 'not_found', 'Subject not found.');
  if (!subject.mathsEnabled) {
    throw new ApiError(403, 'maths_disabled', 'Maths practice is not enabled for this subject.');
  }
}

/** Load the topics of an enabled subject that reach this user (staff may author against any topic in their subject). */
export async function listPracticeTopics(userId: string, user: SessionUser, subjectId: string) {
  await assertSubjectMathsEnabled(subjectId);
  const rows = await db
    .select({ id: topics.id, name: topics.name, description: topics.description, ownerId: topics.ownerId, visibility: topics.visibility })
    .from(topics)
    .where(and(eq(topics.subjectId, subjectId), topicReaches(userId)))
    .orderBy(asc(topics.position), asc(topics.name));

  const withSets = rows.length
    ? await db.select({ topicId: mathSets.topicId, id: mathSets.id, title: mathSets.title, concepts: mathSets.concepts, defaultCount: mathSets.defaultCount, defaultDifficulty: mathSets.defaultDifficulty }).from(mathSets).where(inArray(mathSets.topicId, rows.map((r) => r.id)))
    : [];
  const setsByTopic = new Map<string, typeof withSets>();
  for (const s of withSets) {
    const list = setsByTopic.get(s.topicId) ?? [];
    list.push(s);
    setsByTopic.set(s.topicId, list);
  }

  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    sets: (setsByTopic.get(t.id) ?? []).map((s) => ({ id: s.id, title: s.title, conceptCount: s.concepts.length, defaultCount: s.defaultCount, defaultDifficulty: s.defaultDifficulty })),
  }));
}

export type StartSessionInput = {
  userId: string;
  user: SessionUser;
  topicIds: string[];
  conceptIds?: string[];
  difficulty: Difficulty | 'mixed';
  count: number;
};

/**
 * Deal a session. With a set's concepts (or an explicit concept list) the
 * questions come only from those concepts; otherwise every concept of the
 * difficulty is in play — a free practice session. The paper travels to the
 * client without answers; marking re-derives each draft from its id.
 */
export async function startPracticeSession(input: StartSessionInput) {
  const { userId, user, topicIds, difficulty, count } = input;
  const safeCount = Math.min(Math.max(1, count), 30);

  const topicRows = topicIds.length
    ? await db.select({ id: topics.id, subjectId: topics.subjectId, name: topics.name }).from(topics).where(inArray(topics.id, topicIds))
    : [];
  if (topicIds.length > 0 && topicRows.length === 0) throw new ApiError(404, 'not_found', 'Topics not found.');
  const subjectIds = [...new Set(topicRows.map((t) => t.subjectId))];
  for (const sid of subjectIds) await assertSubjectMathsEnabled(sid);

  const conceptIds = (input.conceptIds ?? []).filter((c) => CONCEPT_BY_ID.has(c));
  const pool = (conceptIds.length ? conceptIds : [...CONCEPT_BY_ID.keys()]).map((conceptId) => ({ conceptId, difficulty }));
  const rng = makeRng((Date.now() ^ hashOf(userId)) >>> 0);
  const dealt = dealQuestions(pool, safeCount, rng);
  const paper = dealt.map((q) => buildQuestion(q.questionId, 'short'));

  return {
    topics: topicRows.map((t) => ({ id: t.id, name: t.name })),
    difficulty,
    count: dealt.length,
    paper,
  };
}

function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

export type MarkInput = { questionId: string; answer?: string };

/**
 * Mark answers for one question, or a whole paper. Each entry is re-derived
 * from its id — the server holds no session — and only the verdict travels
 * back, never the draft's expected fields beyond the worked solution for
 * wrong answers.
 */
export async function markPracticeAnswers(userId: string, entries: MarkInput[]) {
  if (entries.length === 0 || entries.length > 30) throw new ApiError(400, 'bad_request', 'answers must hold 1–30 questions.');
  return entries.map((entry) => {
    const parsed = parseQuestionId(entry.questionId);
    if (!parsed) throw new ApiError(400, 'bad_request', `Bad question id "${entry.questionId}".`);
    const draft = buildDraft(parsed.conceptId, parsed.difficulty, parsed.seed);
    const raw = entry.answer ?? '';
    return {
      questionId: entry.questionId,
      correct: markAnswer(draft, raw).correct,
      answer: draft.display,
      solution: draft.solution,
      marks: conceptMarks(parsed.conceptId, parsed.difficulty),
    };
  });
}

// ── set authoring (staff) ───────────────────────────────────────────────────

type SetInput = {
  topicId?: string;
  title?: string;
  description?: string;
  concepts?: string[];
  defaultCount?: number;
  defaultDifficulty?: Difficulty | 'mixed';
};

function validateSetInput(body: SetInput): void {
  const concepts = body.concepts ?? [];
  if (concepts.length === 0) throw new ApiError(400, 'bad_request', 'A set needs at least one concept.');
  const unknown = concepts.filter((c) => !CONCEPT_BY_ID.has(c));
  if (unknown.length > 0) throw new ApiError(400, 'bad_request', `Unknown concepts: ${unknown.join(', ')}.`);
  if (body.defaultDifficulty && !['easy', 'medium', 'hard', 'mixed'].includes(body.defaultDifficulty)) {
    throw new ApiError(400, 'bad_request', 'Default difficulty must be easy, medium, hard or mixed.');
  }
}

async function assertCanAuthorTopic(user: SessionUser, topicId: string) {
  const [topic] = await db.select({ id: topics.id, ownerId: topics.ownerId, subjectId: topics.subjectId }).from(topics).where(eq(topics.id, topicId)).limit(1);
  if (!topic) throw new ApiError(404, 'not_found', 'Topic not found.');
  if (!canManageContent(user)) throw new ApiError(403, 'forbidden', 'Staff only.');
  return topic;
}

export async function createMathSet(user: SessionUser, body: SetInput) {
  if (!body.topicId || !body.title?.trim()) throw new ApiError(400, 'bad_request', 'topicId and title required.');
  validateSetInput(body);
  const topic = await assertCanAuthorTopic(user, body.topicId);
  await assertSubjectMathsEnabled(topic.subjectId);
  const [set] = await db
    .insert(mathSets)
    .values({
      id: crypto.randomUUID(),
      topicId: body.topicId,
      title: body.title.trim(),
      description: body.description?.trim() ?? '',
      concepts: body.concepts ?? [],
      defaultCount: Math.min(Math.max(1, body.defaultCount ?? 10), 30),
      defaultDifficulty: body.defaultDifficulty ?? 'mixed',
      ownerId: user.id,
    })
    .returning();
  return set;
}

export async function updateMathSet(user: SessionUser, setId: string, body: SetInput) {
  const [existing] = await db.select().from(mathSets).where(eq(mathSets.id, setId)).limit(1);
  if (!existing) throw new ApiError(404, 'not_found', 'Set not found.');
  await assertCanAuthorTopic(user, existing.topicId);
  if (body.concepts) validateSetInput({ concepts: body.concepts });
  const update: Record<string, unknown> = {};
  if (typeof body.title === 'string' && body.title.trim()) update.title = body.title.trim();
  if (typeof body.description === 'string') update.description = body.description.trim();
  if (body.concepts) update.concepts = body.concepts;
  if (typeof body.defaultCount === 'number') update.defaultCount = Math.min(Math.max(1, body.defaultCount), 30);
  if (body.defaultDifficulty) update.defaultDifficulty = body.defaultDifficulty;
  if (Object.keys(update).length) await db.update(mathSets).set(update).where(eq(mathSets.id, setId));
  return { updated: true };
}

export async function deleteMathSet(user: SessionUser, setId: string) {
  const [existing] = await db.select().from(mathSets).where(eq(mathSets.id, setId)).limit(1);
  if (!existing) throw new ApiError(404, 'not_found', 'Set not found.');
  await assertCanAuthorTopic(user, existing.topicId);
  await db.delete(mathSets).where(eq(mathSets.id, setId));
  return { deleted: true };
}

/** The concept catalogue for the authoring UI — no generators, just names. */
export function conceptCatalogue() {
  return [...CONCEPT_BY_ID.values()].map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    description: c.description,
    difficulties: DIFFICULTIES,
    marks: c.marks,
  }));
}
