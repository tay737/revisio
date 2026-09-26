import 'server-only';
import { inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { cardAnswers, cards } from '@/db/schema';
import type { AcceptedAnswer } from '@/domain/grading';
import { buildDailyQueue, type QueueCard } from '@/services/study';

/**
 * The offline pack.
 *
 * Revisio grades on the server, and the daily queue deliberately carries no
 * accepted answers — a queue response should not hand a signed-in user the
 * whole answer key for browsing. But a review session on a train cannot ask the
 * server anything, so the app has to be able to grade one locally.
 *
 * Rather than weaken the queue, the key travels separately and explicitly, in
 * the one shape grading actually needs:
 *
 *   cloze / flashcard → the accepted answers (what `gradeCloze` matches on)
 *   mcq              → the correct option id (what `gradeMcq` compares)
 *
 * This is a *preview* key, and the distinction is load-bearing. A verdict
 * reached offline is provisional: `domain/grading` says the client "may preview
 * but never decide", and that stays true — the queued review is re-graded by
 * `submitReview` when the connection returns, and the server's verdict is what
 * earns XP, moves the schedule and writes the log.
 *
 * Serving the key here also keeps grading's single owner intact: there is still
 * exactly one implementation of every rule, in `domain/grading.ts`, now called
 * from a second place rather than copied into one.
 */
export type OfflineKey =
  | { kind: 'cloze' | 'flashcard'; accepted: AcceptedAnswer[] }
  | { kind: 'mcq'; correctOptionId: string };

export type OfflineCard = QueueCard & { key: OfflineKey };

export type OfflinePack = {
  cards: OfflineCard[];
  /** When the pack was taken, so the app can say how stale it is. */
  builtAt: string;
};

export async function buildOfflinePack(userId: string, limit = 20): Promise<OfflinePack> {
  const queue = await buildDailyQueue(userId, limit);
  if (queue.length === 0) return { cards: [], builtAt: new Date().toISOString() };

  const ids = queue.map((card) => card.id);
  const [answerRows, cardRows] = await Promise.all([
    db.select().from(cardAnswers).where(inArray(cardAnswers.cardId, ids)),
    db
      .select({ id: cards.id, correctOptionId: cards.correctOptionId })
      .from(cards)
      .where(inArray(cards.id, ids)),
  ]);

  const acceptedByCard = new Map<string, AcceptedAnswer[]>();
  for (const answer of answerRows) {
    const list = acceptedByCard.get(answer.cardId) ?? [];
    list.push({
      id: answer.id,
      text: answer.text,
      isPrimary: answer.isPrimary,
      keywords: answer.keywords ?? null,
      minPoints: answer.minPoints ?? null,
    });
    acceptedByCard.set(answer.cardId, list);
  }

  const correctOptionByCard = new Map(cardRows.map((row) => [row.id, row.correctOptionId] as const));

  return {
    cards: queue.map((card) => ({
      ...card,
      key:
        card.kind === 'mcq'
          ? { kind: 'mcq', correctOptionId: correctOptionByCard.get(card.id) ?? '' }
          : { kind: card.kind, accepted: acceptedByCard.get(card.id) ?? [] },
    })),
    builtAt: new Date().toISOString(),
  };
}
