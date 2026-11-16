import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { acceptDraft } from '@/services/ai-drafts';
import type { CardInput } from '@/services/card-input';

/**
 * POST /api/v1/drafts/[id]/accept — write the proposal (or the author's edited
 * subset) into a topic. Cards inherit the topic's visibility/ownerId and are
 * marked generated:true; lessonId from the payload is ignored by design.
 */
export const POST = route(async (req: NextRequest, ctx: { params: Record<string, string> }) => {
  const user = await requireUser(req);
  const body = (await req.json().catch(() => ({}))) as { topicId?: string; cards?: CardInput[] };
  return ok(await acceptDraft(user, ctx.params.id, body));
});
