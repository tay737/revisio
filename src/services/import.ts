import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { cardAnswers, cards, imports, topics } from '@/db/schema';
import { ApiError } from '@/services/api';
import type { SessionUser } from '@/services/auth';
import { canManageContent } from '@/services/roles';
import { makeSlug, loadEditableTopic } from '@/services/content-ops';
import type { ImportKind, ParsedCard, ParseError } from '@/domain/parse-import';
import type { Visibility } from '@/services/visibility';

/**
 * Import — turning parsed rows into content, against a target the user chose.
 *
 * The previous version took only a *name* and always minted a new private
 * topic. So importing a deck and writing notes for the same subject produced
 * two topics that the app offered no way to combine — the questions lived in
 * one and the notes in the other, and neither was studiable. Attaching is now
 * the default path and creating a topic is the alternative, not the only
 * option.
 *
 * Visibility is inherited from the target rather than forced to `private`.
 * That was the second half of the same bug: imported cards could never join a
 * published topic because they arrived private, and nothing could re-publish
 * them. A deck imported into a public topic is public, because that is the only
 * reading under which "import into this topic" means anything.
 */

export type ImportTarget =
  | { mode: 'new'; name: string; subjectId: string; publish?: boolean }
  | { mode: 'existing'; topicId: string };

export type ImportOutcome = {
  importId: string;
  topicId: string;
  topicName: string;
  /** true when the deck was attached to a topic that already existed */ attached: boolean;
  created: number;
  failed: number;
  errors: ParseError[];
};

const INSERT_CHUNK = 400;

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** Resolve (or create) the topic this deck lands in, and the visibility it inherits. */
async function resolveTarget(
  user: SessionUser,
  target: ImportTarget,
): Promise<{ topicId: string; topicName: string; attached: boolean; visibility: Visibility; ownerId: string | null }> {
  if (target.mode === 'existing') {
    const topic = await loadEditableTopic(user, target.topicId);
    return {
      topicId: topic.id,
      topicName: topic.name,
      attached: true,
      visibility: topic.visibility as Visibility,
      ownerId: topic.ownerId,
    };
  }

  if (!target.subjectId) throw new ApiError(400, 'bad_request', 'Choose a subject for the new topic.');
  const staff = canManageContent(user);
  const visibility: Visibility = staff ? 'public' : target.publish ? 'pending_review' : 'private';
  const ownerId = staff ? null : user.id;

  const [topic] = await db
    .insert(topics)
    .values({
      id: crypto.randomUUID(),
      subjectId: target.subjectId,
      name: target.name,
      slug: makeSlug(staff ? 'staff' : 'user', target.name, user.id.slice(0, 8), Date.now().toString(36)),
      visibility,
      ownerId,
    })
    .returning();

  return { topicId: topic.id, topicName: topic.name, attached: false, visibility, ownerId };
}

export async function runImport(
  user: SessionUser,
  input: { kind: ImportKind; filename: string; target: ImportTarget; rows: ParsedCard[]; errors: ParseError[] },
): Promise<ImportOutcome> {
  const resolved = await resolveTarget(user, input.target);

  const [importRow] = await db
    .insert(imports)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      kind: input.kind,
      filename: input.filename,
      status: 'pending',
      targetTopicId: resolved.topicId,
    })
    .returning();

  const cardRows: (typeof cards.$inferInsert)[] = [];
  const answerRows: (typeof cardAnswers.$inferInsert)[] = [];

  for (const r of input.rows) {
    const id = crypto.randomUUID();
    if (r.kind === 'cloze') {
      cardRows.push({
        id, topicId: resolved.topicId, kind: 'cloze', textWithBlank: r.textWithBlank,
        visibility: resolved.visibility, ownerId: resolved.ownerId,
      });
      r.answers.forEach((text, i) => answerRows.push({ id: crypto.randomUUID(), cardId: id, text, isPrimary: i === 0 }));
    } else if (r.kind === 'flashcard') {
      cardRows.push({
        id, topicId: resolved.topicId, kind: 'flashcard', prompt: r.prompt,
        visibility: resolved.visibility, ownerId: resolved.ownerId,
      });
      answerRows.push({ id: crypto.randomUUID(), cardId: id, text: r.model, isPrimary: true });
    } else {
      cardRows.push({
        id, topicId: resolved.topicId, kind: 'mcq', question: r.question,
        options: r.options.map((text, i) => ({ id: `o${i}`, text })), correctOptionId: `o${r.correctIdx}`,
        visibility: resolved.visibility, ownerId: resolved.ownerId,
      });
    }
  }

  // Batched rather than one statement per card: a 5 MB deck was previously 5,000
  // round-trips, which is what made a large import time out rather than fail.
  for (const batch of chunk(cardRows, INSERT_CHUNK)) await db.insert(cards).values(batch);
  for (const batch of chunk(answerRows, INSERT_CHUNK)) await db.insert(cardAnswers).values(batch);

  const created = cardRows.length;
  await db
    .update(imports)
    .set({
      status: created > 0 ? 'done' : 'failed',
      report: { total: input.rows.length + input.errors.length, created, failed: input.errors.length, errors: input.errors },
    })
    .where(eq(imports.id, importRow.id));

  return {
    importId: importRow.id,
    topicId: resolved.topicId,
    topicName: resolved.topicName,
    attached: resolved.attached,
    created,
    failed: input.errors.length,
    errors: input.errors.slice(0, 20),
  };
}
