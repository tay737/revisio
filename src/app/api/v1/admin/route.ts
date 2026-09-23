import { NextRequest } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { approvalRequests, featureFlags, users } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { isDeveloper } from '@/services/roles';
import { listSchedulers } from '@/domain/srs';
import { auditLog } from '@/db/schema';
import { topics } from '@/db/schema';

/** GET /admin — approvals, flags, algorithms, users, pending topics (developers only) */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  if (!isDeveloper(user)) throw new ApiError(403, 'forbidden', 'Developers only.');
  void user;

  const [approvals, flags, allUsers, pendingTopics, audits] = await Promise.all([
    db
      .select({
        id: approvalRequests.id,
        userId: approvalRequests.userId,
        email: users.email,
        name: users.name,
        roleRequested: approvalRequests.roleRequested,
        note: approvalRequests.note,
        status: approvalRequests.status,
        createdAt: approvalRequests.createdAt,
      })
      .from(approvalRequests)
      .innerJoin(users, eq(approvalRequests.userId, users.id))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(100),
    db.select().from(featureFlags),
    db
      .select({
        id: users.id, email: users.email, name: users.name, role: users.role, status: users.status,
        emailVerifiedAt: users.emailVerifiedAt, totpEnabled: users.totpEnabled, createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(200),
    db.select().from(topics).where(eq(topics.visibility, 'pending_review')).limit(100),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(50),
  ]);

  return ok({
    approvals,
    flags,
    algorithms: listSchedulers(),
    users: allUsers,
    pendingTopics,
    audit: audits,
  });
});

/** POST /admin — approvals / flags / algorithms / user roles / topic review */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  if (!isDeveloper(user)) throw new ApiError(403, 'forbidden', 'Developers only.');
  const body = (await req.json()) as {
    action: 'approve_request' | 'reject_request' | 'set_flag' | 'update_algorithm' | 'set_user_role' | 'suspend_user' | 'activate_user' | 'review_topic';
    approvalId?: string;
    flagKey?: string;
    enabled?: boolean;
    algorithm?: string;
    params?: Record<string, number>;
    userId?: string;
    role?: 'student' | 'teacher' | 'developer';
    topicId?: string;
    approveTopic?: boolean;
  };

  const audit = async (action: string, target: string, meta?: Record<string, unknown>) => {
    await db.insert(auditLog).values({ id: crypto.randomUUID(), actorId: user.id, action, target, meta });
  };

  switch (body.action) {
    case 'approve_request':
    case 'reject_request': {
      if (!body.approvalId) throw new ApiError(400, 'bad_request', 'approvalId required');
      const [r] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, body.approvalId)).limit(1);
      if (!r) throw new ApiError(404, 'not_found', 'Approval request not found.');
      if (r.status !== 'pending') throw new ApiError(409, 'conflict', 'Already decided.');
      const approved = body.action === 'approve_request';
      await db.update(approvalRequests).set({ status: approved ? 'approved' : 'rejected', reviewedBy: user.id, decidedAt: new Date() }).where(eq(approvalRequests.id, r.id));
      if (approved) await db.update(users).set({ role: r.roleRequested, status: 'active' }).where(eq(users.id, r.userId));
      await audit(body.action, r.id, { targetUser: r.userId, roleRequested: r.roleRequested });
      return ok({ ok: true });
    }
    case 'set_flag': {
      if (!body.flagKey) throw new ApiError(400, 'bad_request', 'flagKey required');
      await db.update(featureFlags).set({ enabled: body.enabled ?? false }).where(eq(featureFlags.key, body.flagKey));
      await audit('set_flag', body.flagKey, { enabled: body.enabled });
      return ok({ ok: true });
    }
    case 'update_algorithm': {
      // Algorithms keep params in the srs_algorithms feature flag payload; scheduler
      // registry is code (ARCHITECTURE.md §8). Changing default algorithm here.
      if (!body.algorithm) throw new ApiError(400, 'bad_request', 'algorithm required');
      const key = 'srs_algorithms';
      const [flag] = await db.select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
      let cfg: { default: string; params: Record<string, Record<string, number>> } = { default: 'sm2', params: {} };
      if (flag) {
        try { cfg = JSON.parse(flag.description) as typeof cfg; } catch { /* keep fallback */ }
      }
      cfg.default = body.algorithm;
      if (body.params) cfg.params = { ...cfg.params, [body.algorithm]: body.params };
      if (flag) {
        await db.update(featureFlags).set({ description: JSON.stringify(cfg) }).where(eq(featureFlags.key, key));
      } else {
        await db.insert(featureFlags).values({ key, description: JSON.stringify(cfg), enabled: true });
      }
      await audit('update_algorithm', body.algorithm, { params: body.params });
      return ok({ ok: true, config: cfg });
    }
    case 'set_user_role': {
      if (!body.userId || !body.role) throw new ApiError(400, 'bad_request', 'userId and role required');
      await db.update(users).set({ role: body.role }).where(eq(users.id, body.userId));
      await audit('set_user_role', body.userId, { role: body.role });
      return ok({ ok: true });
    }
    case 'suspend_user':
    case 'activate_user': {
      if (!body.userId) throw new ApiError(400, 'bad_request', 'userId required');
      await db.update(users).set({ status: body.action === 'suspend_user' ? 'suspended' : 'active' }).where(eq(users.id, body.userId));
      await audit(body.action, body.userId);
      return ok({ ok: true });
    }
    case 'review_topic': {
      if (!body.topicId) throw new ApiError(400, 'bad_request', 'topicId required');
      await db.update(topics).set({ visibility: body.approveTopic ? 'public' : 'private' }).where(eq(topics.id, body.topicId));
      await audit('review_topic', body.topicId, { approveTopic: body.approveTopic });
      return ok({ ok: true });
    }
    default:
      throw new ApiError(400, 'bad_request', 'Unknown action.');
  }
});
