import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { takeRateLimitAttempt } from '@/services/rate-limit';
import { proposeDraft } from '@/services/ai-drafts';
import type { DraftCounts } from '@/services/ai';

/**
 * /api/v1/drafts — the AI draft pipeline (#7, v1), teachers/developers only.
 *
 *   POST → { sourceText, targetTopicId?, counts? } runs the provider and stores
 *          a 'proposed' ai_drafts row. Returns the validated CardInput[] for
 *          the review UI — NO cards are written here (mirrors generate_cloze).
 *          Accept and reject live under /api/v1/drafts/[id]/.
 */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json()) as {
    sourceText?: string;
    targetTopicId?: string;
    counts?: DraftCounts;
  };
  await takeRateLimitAttempt('draft', user.id);
  const result = await proposeDraft(user, body);
  return ok(result, { status: 201 });
});
