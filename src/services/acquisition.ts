import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { cardAnswers, cards, referralCodes, referralRedemptions, subjects, topics } from '@/db/schema';
import { ApiError } from '@/services/api';
import { appUrl } from '@/services/email';
import {
  gradeClozeWithPolicy,
  gradeFlashcard,
  gradeMcq,
  type AcceptedAnswer,
  type Verdict,
} from '@/domain/grading';
import { resolveClozeMarking } from '@/services/grading-policy';

// ── #20 acquisition: peer referrals + public sample deck ────────────────────
//
// Referral codes are one shareable code per learner (referral_codes, unique
// per user). A redemption is written once per referred account at
// registration — the unique index on referred_user_id makes double-submit and
// replay harmless. Codes rotate on request so a leaked code can be retired
// without losing redemption history (the snapshot `code` column keeps stats
// intact).
//
// The sample deck is deliberately *not* a new content type: it serves the
// same official public cards the app already publishes (ownerId IS NULL on
// both topic and card layers, visibility 'public' on both), minus every
// answer field. Grading runs the real domain graders server-side and writes
// nothing — no card state, no XP, no streak, no user row. It is a demo, not a
// session.

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1 — read aloud safely
const CODE_LENGTH = 8;

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length >= 4 && code.length <= 16 ? code : null;
}

async function insertCode(userId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      await db.insert(referralCodes).values({ id: crypto.randomUUID(), userId, code });
      return code;
    } catch (e) {
      // Unique-code collision: retry with a fresh draw. Anything else is real.
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('referral_codes_code_idx') && !msg.includes('duplicate key')) throw e;
    }
  }
  throw new ApiError(500, 'code_generation_failed', 'Could not allocate a referral code. Try again.');
}

export type ReferralSummary = {
  code: string;
  shareUrl: string;
  invited: number;
  createdAt: Date;
};

/** The learner's code, creating it on first ask. */
export async function myReferralCode(userId: string): Promise<ReferralSummary> {
  const [existing] = await db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.userId, userId))
    .limit(1);
  const row = existing ?? (await (async () => {
    const code = await insertCode(userId);
    const [created] = await db.select().from(referralCodes).where(eq(referralCodes.userId, userId)).limit(1);
    return created ?? { id: '', userId, code, createdAt: new Date(), rotatedAt: null };
  })());
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(referralRedemptions)
    .where(eq(referralRedemptions.referrerUserId, userId));
  return {
    code: row.code,
    shareUrl: `${appUrl()}/register?ref=${row.code}`,
    invited: Number(count ?? 0),
    createdAt: row.createdAt,
  };
}

/** Retire the current code and issue a fresh one; history is untouched. */
export async function rotateReferralCode(userId: string): Promise<ReferralSummary> {
  const [existing] = await db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.userId, userId))
    .limit(1);
  if (existing) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await db
          .update(referralCodes)
          .set({ code: randomCode(), rotatedAt: new Date() })
          .where(eq(referralCodes.id, existing.id));
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('referral_codes_code_idx') && !msg.includes('duplicate key')) throw e;
        if (attempt === 4) throw new ApiError(500, 'code_generation_failed', 'Could not allocate a referral code. Try again.');
      }
    }
  }
  return myReferralCode(userId);
}

/**
 * Attribute a fresh registration to a referral code. Returns true when a
 * redemption was recorded. Never throws for bad input — an invalid or
 * self-referral code simply does not attribute.
 */
export async function redeemReferralCode(rawCode: unknown, referredUserId: string): Promise<boolean> {
  const code = normalizeCode(rawCode);
  if (!code) return false;
  const [referrer] = await db
    .select({ userId: referralCodes.userId })
    .from(referralCodes)
    .where(eq(referralCodes.code, code))
    .limit(1);
  if (!referrer || referrer.userId === referredUserId) return false;
  const inserted = await db
    .insert(referralRedemptions)
    .values({
      id: crypto.randomUUID(),
      code,
      referrerUserId: referrer.userId,
      referredUserId,
    })
    .onConflictDoNothing({ target: referralRedemptions.referredUserId })
    .returning({ id: referralRedemptions.id });
  return inserted.length > 0;
}

/** Public validity check for a code — answers only "does this code exist". */
export async function referralCodeValid(rawCode: unknown): Promise<boolean> {
  const code = normalizeCode(rawCode);
  if (!code) return false;
  const [row] = await db
    .select({ id: referralCodes.id })
    .from(referralCodes)
    .where(eq(referralCodes.code, code))
    .limit(1);
  return !!row;
}

// ── Sample deck ─────────────────────────────────────────────────────────────

export type SampleCard = {
  id: string;
  kind: 'cloze' | 'flashcard' | 'mcq';
  topicName: string;
  subjectName: string;
  textWithBlank: string | null;
  prompt: string | null;
  question: string | null;
  options: { id: string; text: string }[] | null;
};

const SAMPLE_LIMIT = 10;

/**
 * A stable pseudo-random spread of official public cards. Ordering by md5(id)
 * keeps the deck identical between requests without storing a deck row, and
 * the ownerId/visibility filters mean user content can never leak into the
 * unauthenticated surface.
 */
export async function sampleDeck(): Promise<SampleCard[]> {
  const rows = await db
    .select({
      id: cards.id,
      kind: cards.kind,
      textWithBlank: cards.textWithBlank,
      prompt: cards.prompt,
      question: cards.question,
      options: cards.options,
      topicName: topics.name,
      subjectName: subjects.name,
    })
    .from(cards)
    .innerJoin(topics, eq(cards.topicId, topics.id))
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .where(
      and(
        eq(cards.visibility, 'public'),
        eq(topics.visibility, 'public'),
        isNull(cards.ownerId),
        isNull(topics.ownerId),
        isNull(subjects.ownerId),
      ),
    )
    .orderBy(sql`md5(${cards.id})`)
    .limit(SAMPLE_LIMIT);
  // mcq options carry no correctness marker in this shape — correctOptionId is
  // never selected, so it cannot leak even by accident.
  return rows.map((r) => ({ ...r, options: r.options ?? null }));
}

export type SampleGradeResult = {
  verdict: Verdict;
  /** Revealed only after grading — the demo's payoff. */
  primaryAnswer: string | null;
  modelAnswer: string | null;
  explanation: string;
};

/**
 * Grade one sample card with the same rules the real queue uses. Eligibility
 * is re-checked here (not trusted from the deck fetch) so a cardId probe
 * cannot grade private content. Writes nothing.
 */
export async function gradeSampleCard(input: {
  cardId?: unknown;
  answer?: unknown;
  selectedOptionId?: unknown;
}): Promise<SampleGradeResult> {
  const cardId = typeof input.cardId === 'string' ? input.cardId : null;
  if (!cardId) throw new ApiError(400, 'bad_request', 'cardId is required.', 'cardId');

  const [row] = await db
    .select({
      card: cards,
      subjectId: topics.subjectId,
    })
    .from(cards)
    .innerJoin(topics, eq(cards.topicId, topics.id))
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .where(
      and(
        eq(cards.id, cardId),
        eq(cards.visibility, 'public'),
        eq(topics.visibility, 'public'),
        isNull(cards.ownerId),
        isNull(topics.ownerId),
        isNull(subjects.ownerId),
      ),
    )
    .limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'That card is not part of the sample deck.');
  const card = row.card;

  const accepted: AcceptedAnswer[] = (
    await db.select().from(cardAnswers).where(eq(cardAnswers.cardId, card.id))
  ).map((a) => ({
    id: a.id,
    text: a.text,
    isPrimary: a.isPrimary,
    keywords: a.keywords ?? undefined,
    minPoints: a.minPoints ?? undefined,
  }));

  let verdict: Verdict;
  if (card.kind === 'mcq') {
    verdict = gradeMcq(
      typeof input.selectedOptionId === 'string' ? input.selectedOptionId : '',
      card.correctOptionId ?? '',
    );
  } else if (card.kind === 'flashcard') {
    verdict = gradeFlashcard(typeof input.answer === 'string' ? input.answer : '', accepted);
  } else {
    const policy = await resolveClozeMarking(row.subjectId, card.topicId);
    verdict = gradeClozeWithPolicy(typeof input.answer === 'string' ? input.answer : '', accepted, policy);
  }

  const primary = accepted.find((a) => a.isPrimary) ?? accepted[0] ?? null;
  return {
    verdict,
    primaryAnswer: card.kind === 'mcq' ? null : (primary?.text ?? null),
    modelAnswer: card.kind === 'flashcard' ? (primary?.text ?? null) : null,
    explanation: card.explanationMd || '',
  };
}
