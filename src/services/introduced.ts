import 'server-only';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { reviewLogs } from '@/db/schema';

/** Distinct cards whose first-ever review happened today (daily or first
 *  exposure). This is the spend counter for the daily new-card allowance. */
export async function newCardsIntroducedToday(userId: string, dayStart: Date): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(distinct ${reviewLogs.cardId})::int` })
    .from(reviewLogs)
    .where(
      and(
        eq(reviewLogs.userId, userId),
        gte(reviewLogs.reviewedAt, dayStart),
        inArray(reviewLogs.mode, ['daily', 'learn']),
        sql`not exists (
          select 1 from review_logs prev
          where prev.user_id = ${reviewLogs.userId}
            and prev.card_id = ${reviewLogs.cardId}
            and prev.reviewed_at < ${dayStart.toISOString()}
        )`,
      ),
    );
  return row?.c ?? 0;
}
