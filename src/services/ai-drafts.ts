import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { aiDrafts, auditLog, cardAnswers, cards, topics } from '@/db/schema';
import { ApiError } from '@/services/api';
import { PROMPT_VERSION, draftCards, type DraftCounts } from '@/services/ai';
import { validateCards, type CardInput } from '@/services/card-input';
import { loadEditableTopic } from '@/services/content-ops';
import { canManageContent } from '@/services/roles';
import type { SessionUser } from '@/services/auth';

/**
 * AI draft lifecycle (#7, v1) — propose stores a proposal, accept writes the
 * cards, reject closes it. Teachers/developers only (brief §6: students wait
 * for the privacy review).
 *
 * The non-negotiables live here, not in the prompt: nothing is written at
 * propose time; accept re-validates whatever the author sends (edited or
 * verbatim); cards land with the TARGET TOPIC's visibility/ownerId and
 * `generated: true`; model + promptVersion are on the row and in the audit
 * log so a bad batch is identifiable.
 */

const MAX_SOURCE_CHARS = 24_000;
const MAX_ACCEPTED_CARDS = 60;

function assertCanDraft(user: SessionUser) {
  if (!canManageContent(user)) {
    throw new ApiError(403, 'forbidden', 'AI drafting is available to teachers and developers.');
  }
}

async function loadDraft(user: SessionUser, draftId: string) {
  const [draft] = await db.select().from(aiDrafts).where(eq(aiDrafts.id, draftId)).limit(1);
  if (!draft || draft.userId !== user.id) throw new ApiError(404, 'not_found', 'Draft not found.');
  return draft;
}

/** POST /drafts — run the provider, store the proposal, write nothing else. */
export async function proposeDraft(
  user: SessionUser,
  input: { sourceText?: string; targetTopicId?: string; counts?: DraftCounts },
) {
  assertCanDraft(user);
  const sourceText = input.sourceText?.trim() ?? '';
  if (!sourceText) throw new ApiError(400, 'bad_request', 'Paste the source text first.');
  if (sourceText.length > MAX_SOURCE_CHARS) {
    throw new ApiError(400, 'bad_request', `Source text is too long. Keep it under ${MAX_SOURCE_CHARS.toLocaleString()} characters for a v1 draft.`);
  }
  if (input.targetTopicId) {
    const [t] = await db.select({ id: topics.id }).from(topics).where(eq(topics.id, input.targetTopicId)).limit(1);
    if (!t) throw new ApiError(404, 'not_found', 'Target topic not found.');
  }

  const { cards: proposals, model } = await draftCards(sourceText, input.counts ?? {});

  const [draft] = await db
    .insert(aiDrafts)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      targetTopicId: input.targetTopicId ?? null,
      model,
      promptVersion: PROMPT_VERSION,
      status: 'proposed',
      payload: { cards: proposals },
      sourceChars: sourceText.length,
    })
    .returning();

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    actorId: user.id,
    action: 'ai_draft_propose',
    target: draft.id,
    meta: { model, promptVersion: PROMPT_VERSION, proposed: proposals.length, sourceChars: sourceText.length, targetTopicId: input.targetTopicId ?? null },
  });

  return { draftId: draft.id, model, promptVersion: PROMPT_VERSION, cards: proposals };
}

/**
 * POST /drafts/:id/accept — write the (possibly edited) cards into a topic.
 * `cards` in the body overrides the stored payload, which is how the editor's
 * accept-with-edits path works; absent, the proposal goes in verbatim.
 */
export async function acceptDraft(
  user: SessionUser,
  draftId: string,
  input: { topicId?: string; cards?: CardInput[] },
) {
  assertCanDraft(user);
  const draft = await loadDraft(user, draftId);
  if (draft.status !== 'proposed') {
    throw new ApiError(409, 'conflict', 'This draft was already decided.');
  }
  const topicId = input.topicId ?? draft.targetTopicId;
  if (!topicId) throw new ApiError(400, 'bad_request', 'topicId required. Pick where the cards land.');
  const topic = await loadEditableTopic(user, topicId);

  const proposed = ((draft.payload as { cards?: CardInput[] }).cards ?? []) as CardInput[];
  const incoming = input.cards ?? proposed;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    throw new ApiError(400, 'bad_request', 'Nothing to accept.');
  }
  if (incoming.length > MAX_ACCEPTED_CARDS) {
    throw new ApiError(400, 'bad_request', `Accept at most ${MAX_ACCEPTED_CARDS} cards at a time.`);
  }
  validateCards(incoming);

  let inserted = 0;
  for (const c of incoming) {
    const cardId = crypto.randomUUID();
    // lessonId is deliberately not honoured: AI proposals are topic-level, and
    // a forged lessonId must not be able to file a card under another topic's
    // lesson. The author can move cards afterwards through the editor.
    if (c.kind === 'cloze') {
      await db.insert(cards).values({
        id: cardId, topicId: topic.id, kind: 'cloze', textWithBlank: c.textWithBlank ?? '',
        explanationMd: c.explanationMd ?? '', visibility: topic.visibility, ownerId: topic.ownerId, generated: true,
      });
      await db.insert(cardAnswers).values((c.answers ?? []).map((text, i) => ({ id: crypto.randomUUID(), cardId, text, isPrimary: i === 0 })));
    } else if (c.kind === 'flashcard') {
      await db.insert(cards).values({
        id: cardId, topicId: topic.id, kind: 'flashcard', prompt: c.prompt ?? '',
        explanationMd: c.explanationMd ?? '', visibility: topic.visibility, ownerId: topic.ownerId, generated: true,
      });
      await db.insert(cardAnswers).values({
        id: crypto.randomUUID(), cardId, text: c.answers?.[0] ?? '', isPrimary: true,
        keywords: c.keywords ?? null, minPoints: c.minPoints ?? null,
      });
    } else {
      await db.insert(cards).values({
        id: cardId, topicId: topic.id, kind: 'mcq', question: c.question ?? '',
        options: (c.options ?? []).map((text, i) => ({ id: `o${i}`, text })), correctOptionId: `o${c.correctIdx ?? 0}`,
        explanationMd: c.explanationMd ?? '', visibility: topic.visibility, ownerId: topic.ownerId, generated: true,
      });
    }
    inserted += 1;
  }

  const status = inserted === proposed.length ? 'accepted' : 'partial';
  await db
    .update(aiDrafts)
    .set({ status, decidedBy: user.id, decidedAt: new Date(), decisionNote: null })
    .where(eq(aiDrafts.id, draft.id));

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    actorId: user.id,
    action: 'ai_draft_accept',
    target: draft.id,
    meta: { model: draft.model, promptVersion: draft.promptVersion, inserted, proposed: proposed.length, topicId: topic.id, topicName: topic.name, edited: input.cards !== undefined },
  });

  return { draftId: draft.id, topicId: topic.id, inserted, proposed: proposed.length, status };
}

/** POST /drafts/:id/reject — close the proposal; nothing was ever written. */
export async function rejectDraft(user: SessionUser, draftId: string, reason?: string) {
  assertCanDraft(user);
  const draft = await loadDraft(user, draftId);
  if (draft.status !== 'proposed') {
    throw new ApiError(409, 'conflict', 'This draft was already decided.');
  }
  await db
    .update(aiDrafts)
    .set({ status: 'rejected', decidedBy: user.id, decidedAt: new Date(), decisionNote: reason?.slice(0, 500) || null })
    .where(eq(aiDrafts.id, draft.id));
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    actorId: user.id,
    action: 'ai_draft_reject',
    target: draft.id,
    meta: { model: draft.model, promptVersion: draft.promptVersion, reason: reason?.slice(0, 500) ?? null },
  });
  return { draftId: draft.id, status: 'rejected' as const };
}
