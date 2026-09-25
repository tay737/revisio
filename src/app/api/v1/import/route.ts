import { NextRequest } from 'next/server';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { parseContent, type ImportKind } from '@/domain/parse-import';
import { runImport, type ImportTarget } from '@/services/import';

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * POST /import — parse a deck server-side and store it.
 *
 * The body names a *target*: an existing topic (`topicId`) to attach to, or a
 * new one (`topicName` + `subjectId`). Attaching is what stops the questions
 * and the notes for one subject from ending up in two unmergeable topics.
 *
 * Parsing lives in domain/parse-import.ts and writing in services/import.ts;
 * this route only validates the envelope.
 */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const form = await req.formData();
  const file = form.get('file');
  const kind = String(form.get('kind') ?? 'tsv') as ImportKind;
  const topicId = String(form.get('topicId') ?? '').trim();
  const topicName = String(form.get('topicName') ?? '').trim();
  const subjectId = String(form.get('subjectId') ?? '').trim();
  const publish = String(form.get('publish') ?? '') === 'true';

  if (!(file instanceof File)) throw new ApiError(400, 'bad_request', 'Choose a file to import.');
  if (file.size > MAX_BYTES) throw new ApiError(413, 'too_large', 'That file is over 5 MB — split it and import the parts.');
  if (!['csv', 'tsv', 'anki_tsv'].includes(kind)) throw new ApiError(400, 'bad_request', 'Choose CSV, TSV or Anki TSV.');

  const target: ImportTarget = topicId
    ? { mode: 'existing', topicId }
    : { mode: 'new', name: topicName || file.name.replace(/\.[^.]+$/, ''), subjectId, publish };

  const { rows, errors } = parseContent(await file.text(), kind);
  if (rows.length === 0) {
    return ok(
      {
        created: 0,
        failed: errors.length,
        errors: errors.slice(0, 20),
        message: 'Nothing in that file could be read as a question.',
      },
      { status: 400 },
    );
  }

  const outcome = await runImport(user, { kind, filename: file.name, target, rows, errors });
  return ok(outcome, { status: 201 });
});
