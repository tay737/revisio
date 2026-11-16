import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { rejectDraft } from '@/services/ai-drafts';

/**
 * POST /api/v1/drafts/[id]/reject — close a proposal. Nothing was ever written;
 * the optional reason lands on the row and in the audit log (pilot metric).
 */
export const POST = route(async (req: NextRequest, ctx: { params: Record<string, string> }) => {
  const user = await requireUser(req);
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  return ok(await rejectDraft(user, ctx.params.id, body.reason));
});
