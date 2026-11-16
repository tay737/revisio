/**
 * Proves the #7 v1 AI draft pipeline end-to-end against the live primary with
 * the deterministic stub provider (AI_PROVIDER=stub — no key, no network):
 *
 *   student → 403
 *   propose → ai_drafts row 'proposed', validated CardInput[], NO card writes
 *   accept  → cards land generated:true under the topic's visibility
 *   reject  → 'rejected', zero card writes
 *   malformed provider output → 502 ai_bad_output, nothing stored
 *
 * Every row it creates is removed at the end. Same receipt style as
 * verify:season-write — the failure this catches (RLS on a new table, a bad
 * insert shape) is invisible until a real draft tries to land.
 */
import 'dotenv/config';
process.env.AI_PROVIDER = 'stub';

import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { aiDrafts, auditLog, cardAnswers, cards, subjects, topics, users } from '../src/db/schema';
import { ApiError } from '../src/services/api';
import { acceptDraft, proposeDraft, rejectDraft } from '../src/services/ai-drafts';
import type { SessionUser } from '../src/services/auth';

const SOURCE = `Photosynthesis is the process by which green plants convert light energy into chemical energy. The light energy is captured by chlorophyll in the chloroplasts. Carbon dioxide and water are the raw materials, and glucose is the product. Oxygen is released as a waste product during the light-dependent reactions. The Calvin cycle uses ATP and NADPH to fix carbon into sugar.`;

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures += 1;
}

async function expectApiError(name: string, status: number, code: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, 'no error thrown');
  } catch (e) {
    const ok = e instanceof ApiError && e.status === status && e.code === code;
    check(name, ok, e instanceof ApiError ? `${e.status} ${e.code}` : String(e));
  }
}

// ── fixtures: a real staff user + a throwaway private topic ─────────────────
const [staff] = await db
  .select({ id: users.id, email: users.email, name: users.name, role: users.role, status: users.status })
  .from(users)
  .where(sql`${users.role} in ('teacher','developer') and ${users.status} = 'active'`)
  .limit(1);
if (!staff) throw new Error('no active teacher/developer user to verify with');
const teacher = staff as SessionUser;
console.log('staff user:', teacher.email, `(${teacher.role})`);

const [subject] = await db.select().from(subjects).limit(1);
if (!subject) throw new Error('no subject to hang the temp topic on');

const topicId = crypto.randomUUID();
const MARK = `ai-draft-verify-${Date.now().toString(36)}`;
await db.insert(topics).values({
  id: topicId,
  subjectId: subject.id,
  name: MARK,
  slug: MARK,
  description: 'verify fixture — deleted at end of script',
  visibility: 'private',
  ownerId: null,
});

const draftIds: string[] = [];

try {
  // 1. students cannot draft at all
  const student: SessionUser = { id: 'verify-student', email: 's@x', name: 'S', role: 'student', status: 'active' };
  await expectApiError('student propose → 403', 403, 'forbidden', () =>
    proposeDraft(student, { sourceText: SOURCE, counts: { cloze: 2 } }),
  );

  // 2. propose writes a draft row and validated proposals — and no cards
  const prop = await proposeDraft(teacher, { sourceText: SOURCE, targetTopicId: topicId, counts: { cloze: 3, flashcard: 1, mcq: 1 } });
  draftIds.push(prop.draftId);
  check('propose returns cards', prop.cards.length > 0, `${prop.cards.length} cards, model=${prop.model}`);
  check('propose is stub model', prop.model === 'stub-deterministic');
  const [row] = await db.select().from(aiDrafts).where(eq(aiDrafts.id, prop.draftId));
  check('draft row proposed', row?.status === 'proposed');
  check('draft row has target', row?.targetTopicId === topicId);
  const cardsBefore = await db.select({ id: cards.id }).from(cards).where(eq(cards.topicId, topicId));
  check('propose wrote no cards', cardsBefore.length === 0);

  // 3. accept writes generated cards under the topic's visibility
  const acc = await acceptDraft(teacher, prop.draftId, {});
  check('accept inserted all proposed', acc.inserted === prop.cards.length && acc.status === 'accepted', `${acc.inserted}/${acc.proposed}`);
  const written = await db
    .select()
    .from(cards)
    .where(eq(cards.topicId, topicId));
  check('cards generated:true', written.length > 0 && written.every((c) => c.generated === true));
  check('cards inherit private visibility', written.every((c) => c.visibility === 'private'));
  const [decided] = await db.select().from(aiDrafts).where(eq(aiDrafts.id, prop.draftId));
  check('draft decided accepted', decided?.status === 'accepted' && decided.decidedBy === teacher.id);

  // 4. reject writes nothing
  const prop2 = await proposeDraft(teacher, { sourceText: SOURCE, counts: { cloze: 2 } });
  draftIds.push(prop2.draftId);
  const before = await db.select({ id: cards.id }).from(cards).where(eq(cards.topicId, topicId));
  const rej = await rejectDraft(teacher, prop2.draftId, 'verify: not good enough');
  check('reject status', rej.status === 'rejected');
  const after = await db.select({ id: cards.id }).from(cards).where(eq(cards.topicId, topicId));
  check('reject wrote no cards', after.length === before.length);
  const [rejRow] = await db.select().from(aiDrafts).where(eq(aiDrafts.id, prop2.draftId));
  check('reject note stored', rejRow?.decisionNote === 'verify: not good enough');

  // 5. malformed provider output fails cleanly, nothing stored
  process.env.AI_STUB_MODE = 'invalid';
  await expectApiError('malformed output → 502', 502, 'ai_bad_output', () =>
    proposeDraft(teacher, { sourceText: SOURCE, counts: { cloze: 2 } }),
  );
  delete process.env.AI_STUB_MODE;

  // 6. unconfigured provider is a clean error, not a crash
  delete process.env.AI_PROVIDER;
  await expectApiError('no provider → 503', 503, 'ai_unavailable', () =>
    proposeDraft(teacher, { sourceText: SOURCE, counts: { cloze: 2 } }),
  );
  process.env.AI_PROVIDER = 'stub';
} finally {
  // ── cleanup: cards → answers, topic, drafts, audit rows, fixture topic ──
  const topicCards = await db.select({ id: cards.id }).from(cards).where(eq(cards.topicId, topicId));
  for (const c of topicCards) {
    await db.delete(cardAnswers).where(eq(cardAnswers.cardId, c.id));
  }
  await db.delete(cards).where(eq(cards.topicId, topicId));
  await db.delete(topics).where(eq(topics.id, topicId));
  for (const id of draftIds) await db.delete(aiDrafts).where(eq(aiDrafts.id, id));
  await db.delete(auditLog).where(sql`${auditLog.action} like 'ai_draft_%' and ${auditLog.target} in (${sql.join(draftIds.map((id) => sql`${id}`), sql`, `)})`);
  console.log(`cleanup: ${topicCards.length} cards, ${draftIds.length} drafts removed`);
}

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);