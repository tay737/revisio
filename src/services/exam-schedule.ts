import 'server-only';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { examPlans, featureFlags, topics } from '@/db/schema';
import { daysUntil } from '@/domain/retention';

// ── exam-aware scheduling (#4) ──────────────────────────────────────────────
//
// The exam-date source is `exam_plans` — the #17 countdown/planner already
// stores exactly what a scheduler needs (examDate + topicIds + subjectId +
// status), so a second `exam_dates` table would be a duplicate that can
// disagree with the plan the learner is looking at. `examDatesForUser`
// flattens active plans into topicId → earliest exam date; a plan with no
// topicIds covers its whole subject.
//
// Rollout is flag-gated: `feature_flags.exam_aware_queue.enabled`. The queue
// builders read it per request; the offline backtest
// (scripts/eval-schedulers.ts) is the evidence gate for enabling it.

export const EXAM_AWARE_FLAG = 'exam_aware_queue';

export async function examAwareEnabled(): Promise<boolean> {
  const [row] = await db
    .select({ enabled: featureFlags.enabled })
    .from(featureFlags)
    .where(eq(featureFlags.key, EXAM_AWARE_FLAG))
    .limit(1);
  return row?.enabled === true;
}

export type ExamDateEntry = { examDate: string; daysLeft: number };

/**
 * topicId → nearest upcoming exam date covering that topic. Empty map when
 * the learner has no active plans — the queue then behaves exactly as before.
 */
export async function examDatesForUser(userId: string, now = new Date()): Promise<Map<string, ExamDateEntry>> {
  const today = now.toISOString().slice(0, 10);
  const plans = await db
    .select()
    .from(examPlans)
    .where(and(eq(examPlans.userId, userId), eq(examPlans.status, 'active'), gte(examPlans.examDate, today)));
  if (plans.length === 0) return new Map();

  // Plans scoped to a whole subject need their topic ids expanded once.
  const subjectIds = [...new Set(plans.map((p) => p.subjectId).filter((s): s is string => !!s))];
  const subjectTopics = subjectIds.length
    ? await db.select({ id: topics.id, subjectId: topics.subjectId }).from(topics).where(inArray(topics.subjectId, subjectIds))
    : [];
  const topicsBySubject = new Map<string, string[]>();
  for (const t of subjectTopics) {
    const list = topicsBySubject.get(t.subjectId) ?? [];
    list.push(t.id);
    topicsBySubject.set(t.subjectId, list);
  }

  const out = new Map<string, ExamDateEntry>();
  const offer = (topicId: string, examDate: string) => {
    const existing = out.get(topicId);
    if (!existing || examDate < existing.examDate) {
      out.set(topicId, { examDate, daysLeft: daysUntil(examDate, now) });
    }
  };
  for (const plan of plans) {
    if (plan.topicIds.length > 0) {
      for (const topicId of plan.topicIds) offer(topicId, plan.examDate);
    } else if (plan.subjectId) {
      for (const topicId of topicsBySubject.get(plan.subjectId) ?? []) offer(topicId, plan.examDate);
    }
  }
  return out;
}
