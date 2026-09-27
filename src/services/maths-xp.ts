import 'server-only';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { xpEvents } from '@/db/schema';
import { levelForXp } from '@/domain/gamification';
import { totalXpFor, updateLeagueWeek } from '@/services/study';

// ── Maths XP ────────────────────────────────────────────────────────────────
// Practice earns XP — effort should always pay — but it is deliberately
// outside the SRS: no review log, no schedule, no card state, no streak. The
// xp_events row with source 'maths' is the whole footprint, plus the league
// week so the leaderboard sees the same effort reviews do. The anti-grind
// cap keeps farming honest: five sessions an hour pay full rate, beyond that
// each session is worth a token amount.

/** XP for one completed practice session: marks earned, capped, no streak bonus. */
export function xpForMathsSession(input: { marks: number; maxMarks: number; correct: number; total: number }): number {
  const accuracy = input.total > 0 ? input.correct / input.total : 0;
  const base = Math.round(input.marks * 2 + accuracy * 10);
  return Math.max(0, Math.min(base, 60));
}

const WINDOW_MS = 60 * 60 * 1000;
const FULL_RATE_SESSIONS = 5;
const FLOOR_XP = 2;

export type MathsXpResult = {
  xpAwarded: number;
  totalXp: number;
  level: number;
  capped: boolean;
};

export async function awardMathsXp(userId: string, session: { marks: number; maxMarks: number; correct: number; total: number }): Promise<MathsXpResult> {
  const earned = xpForMathsSession(session);

  const [recent] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(xpEvents)
    .where(and(eq(xpEvents.userId, userId), eq(xpEvents.source, 'maths'), gte(xpEvents.occurredAt, new Date(Date.now() - WINDOW_MS))));

  const sessionsThisHour = recent?.c ?? 0;
  const capped = sessionsThisHour >= FULL_RATE_SESSIONS;
  const xpAwarded = capped ? Math.min(earned, FLOOR_XP) : earned;

  if (xpAwarded > 0) {
    await db.insert(xpEvents).values({ id: crypto.randomUUID(), userId, amount: xpAwarded, source: 'maths' });
    await updateLeagueWeek(userId, xpAwarded);
  }

  const totalXp = await totalXpFor(userId);
  const { level } = levelForXp(totalXp);
  return { xpAwarded, totalXp, level, capped };
}
