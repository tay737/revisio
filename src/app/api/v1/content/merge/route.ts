import { NextRequest } from 'next/server';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { mergeTopics } from '@/services/content-ops';

/**
 * POST /content/merge — fold one topic into another.
 *
 * A route of its own because it is not a create, an edit or a delete: it is the
 * one operation that can undo a split. Importing questions separately from the
 * notes they belong to is easy to do by accident (the importer used to make a
 * new topic every time) and, until now, impossible to undo from inside the app.
 *
 * Body: `{ sourceId, targetId, publish? }` — everything in `sourceId` moves into
 * `targetId` and `sourceId` is deleted. `publish` is the "now make it part of
 * the real topic" case: the moved content and its new home go public.
 */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json().catch(() => null)) as {
    sourceId?: string;
    targetId?: string;
    publish?: boolean;
  } | null;

  if (!body?.sourceId) throw new ApiError(400, 'bad_request', 'Choose the topic to merge from.');
  if (!body?.targetId) throw new ApiError(400, 'bad_request', 'Choose the topic to merge into.');

  const result = await mergeTopics(user, body.sourceId, body.targetId, { publish: body.publish === true });
  const parts = [
    result.movedCards > 0 ? `${result.movedCards} ${result.movedCards === 1 ? 'question' : 'questions'}` : null,
    result.movedLessons > 0 ? `${result.movedLessons} ${result.movedLessons === 1 ? 'note set' : 'note sets'}` : null,
  ].filter(Boolean);

  return ok({
    ...result,
    message: parts.length ? `Moved ${parts.join(' and ')}.` : 'Nothing to move — that topic was already empty.',
  });
});
