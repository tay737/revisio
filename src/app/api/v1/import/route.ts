import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { parse as parseCsv } from 'csv-parse/sync';
import { db } from '@/db/client';
import { cardAnswers, cards, imports, subjects, topics } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';

const MAX_BYTES = 5 * 1024 * 1024;

type ParsedCard =
  | { kind: 'cloze'; textWithBlank: string; answers: string[] }
  | { kind: 'flashcard'; prompt: string; model: string }
  | { kind: 'mcq'; question: string; options: string[]; correctIdx: number };

/** Line-based parser. Supported syntaxes:
 *  - CSV/TSV rows: `front<delim>back` (flashcard; `#`-prefixed lines are headers)
 *  - Anki TSV exports (`question\tanswer`)
 *  - `cloze: Stem with ____ | answer1 | answer2`
 *  - `mcq: Question; opt A; opt B; opt C<delim>2` (correct index, 0-based) */
function parseContent(text: string, kind: 'csv' | 'tsv' | 'anki_tsv'): { rows: ParsedCard[]; errors: { row: number; message: string }[] } {
  const delim = kind === 'csv' ? ',' : '\t';
  const errors: { row: number; message: string }[] = [];
  const rows: ParsedCard[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      if (line.startsWith('#')) continue; // header/comment
      if (line.startsWith('cloze:')) {
        const [stem, ...answers] = line.slice(6).split('|').map((s) => s.trim());
        if (!stem || answers.length === 0) throw new Error('cloze needs `cloze: stem with ____ | answer`');
        if (!stem.includes('____')) throw new Error('cloze stem must contain ____');
        rows.push({ kind: 'cloze', textWithBlank: stem, answers });
      } else if (line.startsWith('mcq:')) {
        const [first, ...rest] = line.slice(4).split(delim);
        const parts = first.split(';').map((s) => s.trim());
        const correctIdx = Number(rest[0] ?? parts[parts.length - 1]);
        const opts = parts.slice(1, Number.isFinite(correctIdx) && rest.length ? undefined : -1);
        if (parts.length < 3) throw new Error('mcq needs `mcq: question; opt1; opt2; ...` and correct index');
        if (!Number.isInteger(correctIdx) || correctIdx < 0 || correctIdx >= opts.length) throw new Error('mcq correct index out of range');
        rows.push({ kind: 'mcq', question: parts[0], options: opts, correctIdx });
      } else {
        const records: string[][] = parseCsv(line, { delimiter: delim, relaxColumnCount: true });
        const [front, ...rest] = records[0] ?? [];
        const back = rest.join(delim).trim();
        if (!front || !back) throw new Error(`row needs front and back separated by "${delim}"`);
        rows.push({ kind: 'flashcard', prompt: front.trim(), model: back });
      }
    } catch (e) {
      errors.push({ row: i + 1, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { rows, errors };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'topic';
}

/** POST /import (multipart) — parse file server-side, create private topic + cards */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const form = await req.formData();
  const file = form.get('file');
  const kindRaw = String(form.get('kind') ?? 'tsv');
  const topicName = String(form.get('topicName') ?? 'Imported cards');
  const subjectId = String(form.get('subjectId') ?? '');
  if (!(file instanceof File)) throw new ApiError(400, 'bad_request', 'Upload a file.');
  if (file.size > MAX_BYTES) throw new ApiError(413, 'too_large', 'File too large (max 5 MB).');
  if (!['csv', 'tsv', 'anki_tsv'].includes(kindRaw)) throw new ApiError(400, 'bad_request', 'kind must be csv, tsv or anki_tsv');

  const text = await file.text();
  const { rows, errors } = parseContent(text, kindRaw as 'csv' | 'tsv' | 'anki_tsv');

  const slug = `import-${slugify(topicName)}-${user.id.slice(0, 8)}`;
  let [topic] = await db.select().from(topics).where(eq(topics.slug, slug)).limit(1);
  if (!topic) {
    // need a subject: use provided, else first subject, else create a personal one
    let sid = subjectId;
    if (!sid) {
      const any = await db.select({ id: subjects.id }).from(subjects).limit(1);
      sid = any[0]?.id;
    }
    if (!sid) throw new ApiError(400, 'bad_request', 'No subjects exist yet; pick a subject.');
    [topic] = await db
      .insert(topics)
      .values({ id: crypto.randomUUID(), subjectId: sid, name: topicName, slug, visibility: 'private', ownerId: user.id })
      .returning();
  }

  const [importRow] = await db
    .insert(imports)
    .values({ id: crypto.randomUUID(), userId: user.id, kind: kindRaw as 'csv' | 'tsv' | 'anki_tsv', filename: file.name, status: 'pending', targetTopicId: topic.id })
    .returning();

  let created = 0;
  for (const r of rows) {
    const cardId = crypto.randomUUID();
    if (r.kind === 'cloze') {
      await db.insert(cards).values({ id: cardId, topicId: topic.id, kind: 'cloze', textWithBlank: r.textWithBlank, visibility: 'private', ownerId: user.id });
      await db.insert(cardAnswers).values(r.answers.map((text, idx) => ({ id: crypto.randomUUID(), cardId, text, isPrimary: idx === 0 })));
    } else if (r.kind === 'flashcard') {
      await db.insert(cards).values({ id: cardId, topicId: topic.id, kind: 'flashcard', prompt: r.prompt, visibility: 'private', ownerId: user.id });
      await db.insert(cardAnswers).values({ id: crypto.randomUUID(), cardId, text: r.model, isPrimary: true });
    } else {
      await db.insert(cards).values({
        id: cardId, topicId: topic.id, kind: 'mcq', question: r.question,
        options: r.options.map((text, idx) => ({ id: `o${idx}`, text })), correctOptionId: `o${r.correctIdx}`,
        visibility: 'private', ownerId: user.id,
      });
    }
    created += 1;
  }

  const status = created > 0 ? 'done' : 'failed';
  await db
    .update(imports)
    .set({ status, report: { total: rows.length + errors.length, created, failed: errors.length, errors } })
    .where(eq(imports.id, importRow.id));

  return ok({ importId: importRow.id, topicId: topic.id, topicName: topic.name, created, failed: errors.length, errors: errors.slice(0, 20) }, { status: 201 });
});
