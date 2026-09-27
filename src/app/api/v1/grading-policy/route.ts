import { NextRequest } from 'next/server';
import { asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { subjects, topics } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { canManageContent } from '@/services/roles';
import { getClozeMarkingPayload, setClozeMarking, type ClozePolicyScope } from '@/services/grading-policy';
import type { ClozeMarkPolicy } from '@/domain/grading';

/**
 * Cloze marking policy: how strictly fill-the-blank answers are marked.
 *
 * GET → the payload (default + every scope) plus the subjects/topics a caller
 * may address, so one request drives the settings UI for both roles. Staff
 * only: students have nothing to configure here.
 *
 * POST { scope, policy } → replace that scope's policy. Developers may write
 * every scope; teachers and other content managers only subject/topic ones.
 * Each write is audited by key, never by payload.
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  if (!canManageContent(user)) throw new ApiError(403, 'forbidden', 'Staff only.');
  void req;

  const payload = await getClozeMarkingPayload();
  const [subjectList, topicList] = await Promise.all([
    db.select({ id: subjects.id, name: subjects.name }).from(subjects).orderBy(asc(subjects.name)),
    db.select({ id: topics.id, name: topics.name, subjectId: topics.subjectId }).from(topics).orderBy(asc(topics.name)),
  ]);

  return ok({ ...payload, subjects: subjectList, topics: topicList });
});

export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  if (!canManageContent(user)) throw new ApiError(403, 'forbidden', 'Staff only.');
  if (!user) throw new ApiError(401, 'unauthorized', 'Sign in required.');

  const body = (await req.json().catch(() => null)) as {
    scope?: { type?: string; subjectId?: string; topicId?: string };
    policy?: ClozeMarkPolicy;
  } | null;
  if (!body?.scope || !body.policy) throw new ApiError(400, 'bad_request', 'scope and policy are required.');

  const scope: ClozePolicyScope =
    body.scope.type === 'subject' && body.scope.subjectId
      ? { type: 'subject', subjectId: body.scope.subjectId }
      : body.scope.type === 'topic' && body.scope.topicId
        ? { type: 'topic', topicId: body.scope.topicId }
        : { type: 'global' };

  await setClozeMarking(user, scope, body.policy);
  return ok({ saved: true });
});
