'use client';

// The single owner of everything offline.
//
// Three facts live here and nowhere else: the session we cached, the reviews we
// owe the server, and the rule that a verdict reached without a server is a
// *preview*. Nothing else in the app should read or write those keys, and no
// other module should decide what "offline" means.
//
// Why a preview: `domain/grading` is the one implementation of every grading
// rule and its contract is that the client may preview but never decide. A
// review answered on a train is graded by that same code so the learner can see
// how they did — and then re-graded by `submitReview` when the connection
// returns, because the server's verdict is what earns XP and moves the
// schedule. Offline therefore changes *when* the verdict arrives, never who
// gives it.

import { gradeCloze, gradeFlashcard, gradeMcq, type AcceptedAnswer, type Verdict } from '@/domain/grading';
import { api } from '@/lib/api';

const PACK_KEY = 'revisio.offline.pack.v1';
const OUTBOX_KEY = 'revisio.offline.outbox.v1';

export type OfflineCardKind = 'cloze' | 'flashcard' | 'mcq';

export type OfflineKey =
  | { kind: 'cloze' | 'flashcard'; accepted: AcceptedAnswer[] }
  | { kind: 'mcq'; correctOptionId: string };

export type OfflineCard = {
  id: string;
  kind: OfflineCardKind;
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  textWithBlank: string | null;
  prompt: string | null;
  question: string | null;
  options: { id: string; text: string }[] | null;
  stage: string;
  key: OfflineKey;
};

export type OfflinePack = { cards: OfflineCard[]; builtAt: string };

/** A review the server has not seen yet. Append-only, so replaying it is safe. */
export type PendingReview = {
  id: string;
  cardId: string;
  answer?: string;
  selectedOptionId?: string;
  durationMs: number;
  mode: string;
  queuedAt: string;
};

// ── storage ─────────────────────────────────────────────────────────────────
// localStorage, not IndexedDB: a pack is twenty cards of text, which is small,
// and the synchronous API keeps the read on the render path honest. Every access
// is guarded — a WebView with storage disabled must still load a queue.

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or disabled. Losing the cache degrades offline; it must not
    // break the session that is running.
  }
}

// ── the cached session ──────────────────────────────────────────────────────

export function savePack(pack: OfflinePack): void {
  write(PACK_KEY, pack);
}

export function cachedPack(): OfflinePack | null {
  const pack = read<OfflinePack | null>(PACK_KEY, null);
  return pack && Array.isArray(pack.cards) && pack.cards.length > 0 ? pack : null;
}

export function clearPack(): void {
  try {
    window.localStorage.removeItem(PACK_KEY);
  } catch {
    // nothing to do
  }
}

/**
 * Take a card out of the cached session once the server has accepted a review
 * of it, so coming back offline cannot deal a card that was already answered.
 */
export function dropCardFromPack(cardId: string): void {
  const pack = read<OfflinePack | null>(PACK_KEY, null);
  if (!pack) return;
  const cards = pack.cards.filter((card) => card.id !== cardId);
  if (cards.length === pack.cards.length) return;
  write(PACK_KEY, { ...pack, cards });
}

// ── the outbox ──────────────────────────────────────────────────────────────

export function pendingReviews(): PendingReview[] {
  const list = read<PendingReview[]>(OUTBOX_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function pendingCount(): number {
  return pendingReviews().length;
}

/**
 * Record a review the server has not accepted.
 *
 * The card is removed from the cached pack by the caller once the learner moves
 * on, so a session cannot ask the same card twice; this only holds the debt.
 */
export function enqueueReview(review: Omit<PendingReview, 'id' | 'queuedAt'>): PendingReview {
  const entry: PendingReview = {
    ...review,
    id: `${review.cardId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
  };
  write(OUTBOX_KEY, [...pendingReviews(), entry]);
  return entry;
}

export function dropReview(id: string): void {
  write(OUTBOX_KEY, pendingReviews().filter((r) => r.id !== id));
}

export type SyncOutcome = { sent: number; remaining: number };

/**
 * Hand the outbox back to the server, oldest first.
 *
 * Stops at the first failure rather than skipping ahead: order matters (XP
 * decay and streaks are computed per review as it lands), and a review that was
 * accepted but whose response was lost must be retried from a known point, not
 * overtaken. `submitReview` is idempotent per card per session on the server,
 * so a replay cannot award XP twice.
 */
export async function syncOutbox(): Promise<SyncOutcome> {
  let sent = 0;

  for (const review of pendingReviews()) {
    try {
      await api.post('/api/v1/reviews', {
        cardId: review.cardId,
        ...(review.selectedOptionId !== undefined
          ? { selectedOptionId: review.selectedOptionId }
          : { answer: review.answer ?? '' }),
        durationMs: review.durationMs,
        mode: review.mode,
      });
      dropReview(review.id);
      sent += 1;
    } catch {
      // Offline again, or the server is busy. Keep the rest of the debt.
      break;
    }
  }

  return { sent, remaining: pendingCount() };
}

// ── local preview grading ───────────────────────────────────────────────────

/**
 * Grade a card with no server, using the same rules the server will use.
 *
 * The result is deliberately typed as a plain `Verdict`: it is the preview the
 * scoreboard does not trust. `ReviewClient` renders it exactly as it renders a
 * server verdict, which is the point — offline feedback should feel identical.
 */
export function previewVerdict(card: OfflineCard, input: { answer?: string; selectedOptionId?: string }): Verdict {
  if (card.key.kind === 'mcq') {
    return gradeMcq(input.selectedOptionId ?? null, card.key.correctOptionId);
  }
  if (card.kind === 'flashcard') {
    return gradeFlashcard(input.answer ?? '', card.key.accepted);
  }
  return gradeCloze(input.answer ?? '', card.key.accepted);
}

/** The answer shown once a card is graded — the primary accepted answer. */
export function primaryAnswer(card: OfflineCard): string | undefined {
  if (card.key.kind === 'mcq') {
    const correctId = card.key.correctOptionId;
    return card.options?.find((option) => option.id === correctId)?.text;
  }
  const accepted = card.key.accepted;
  return (accepted.find((answer) => answer.isPrimary) ?? accepted[0])?.text;
}
