/**
 * End-to-end API check against a running server:
 *
 *   npm run build && npm start &            (or a preview server)
 *   NODE_OPTIONS="--import ./scripts/register-stub-loader.mjs" \
 *     npx tsx scripts/verify-api.ts http://127.0.0.1:3100 tayyab@outlook.jp
 *
 * It mints a real access token for the named account with the app's own signing
 * function, then calls the routes the way the browser does. Reading the code is
 * not evidence that a route answers; this is.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { users } from '../src/db/schema';
import { signAccessToken } from '../src/services/auth';

const base = process.argv[2] ?? 'http://127.0.0.1:3100';
const email = process.argv[3] ?? 'tayyab@outlook.jp';

let failures = 0;
function check(label: string, condition: boolean, detail: unknown = '') {
  if (!condition) failures += 1;
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${label}${condition ? '' : ` — ${JSON.stringify(detail)}`}`);
}

async function main() {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new Error(`No account ${email}.`);
  const token = await signAccessToken({ id: user.id, email: user.email, role: user.role, totpEnabled: user.totpEnabled });

  const call = async <T,>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> => {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, body: body as T };
  };

  console.log(`\nVerifying ${base} as ${email} (${user.role})\n`);

  // ── the study loop ────────────────────────────────────────────────────────
  console.log('Daily queue');
  const queue = await call<{ queue: { id: string; kind: string; topicName: string }[] }>('/api/v1/queue/today?limit=50');
  check('answers 200', queue.status === 200, queue.status);
  check('deals cards', (queue.body.queue?.length ?? 0) > 0, `${queue.body.queue?.length ?? 0} cards`);
  check('every card names its topic', (queue.body.queue ?? []).every((c) => Boolean(c.topicName)));

  console.log('\nCram');
  const cramTopics = await call<{ topics: { id: string; name: string; cardCount: number }[] }>('/api/v1/cram');
  check('answers 200', cramTopics.status === 200, cramTopics.status);
  const withCards = (cramTopics.body.topics ?? []).filter((t) => t.cardCount > 0);
  check('some topic advertises questions', withCards.length > 0, cramTopics.body.topics);

  // The promise the picker makes must be the queue it delivers.
  for (const topic of withCards) {
    const session = await call<{ queue: unknown[] }>('/api/v1/cram', {
      method: 'POST',
      body: JSON.stringify({ topicIds: [topic.id], maxPerTopic: 50, noteDensity: 'summary' }),
    });
    check(
      `“${topic.name}” delivers its ${topic.cardCount} advertised questions`,
      session.status === 201 && session.body.queue.length === topic.cardCount,
      session.status === 201 ? session.body.queue.length : session.status,
    );
  }

  // ── the subject listing the Learn page depends on ─────────────────────────
  console.log('\nLearn');
  const mine = await call<{ topics: { id: string; subjectId: string; cardCount: number }[] }>('/api/v1/content?mine=1');
  check('my topics answer 200', mine.status === 200, mine.status);
  const subjectId = mine.body.topics?.[0]?.subjectId;
  if (subjectId) {
    const bySubject = await call<{ topics: { id: string; subjectId: string }[] }>(`/api/v1/content?subjectId=${subjectId}`);
    check('a subject returns its own topics', bySubject.status === 200 && (bySubject.body.topics?.length ?? 0) > 0, bySubject.status);
    check(
      'and every topic belongs to that subject',
      (bySubject.body.topics ?? []).every((t) => t.subjectId === subjectId),
      bySubject.body.topics,
    );
  }

  // ── merge, over HTTP, on topics it creates and removes itself ─────────────
  console.log('\nMerge');
  const subjectForMerge = mine.body.topics?.[0]?.subjectId;
  if (!subjectForMerge) {
    console.log('  skip  no subject available');
  } else {
    const stamp = Date.now().toString(36);
    const a = await call<{ topic: { id: string } }>('/api/v1/content', {
      method: 'POST',
      body: JSON.stringify({
        subjectId: subjectForMerge,
        name: `verify-notes-${stamp}`,
        lessons: [{ title: 'Notes', detailedMd: 'kept', summaryMd: 'kept' }],
      }),
    });
    const b = await call<{ topic: { id: string } }>('/api/v1/content', {
      method: 'POST',
      body: JSON.stringify({
        subjectId: subjectForMerge,
        name: `verify-deck-${stamp}`,
        cards: [{ kind: 'cloze', textWithBlank: 'a ____ b', answers: ['c'] }, { kind: 'cloze', textWithBlank: 'd ____ e', answers: ['f'] }],
      }),
    });
    check('two scratch topics were created', a.status === 201 && b.status === 201, [a.status, b.status]);

    const targetId = a.body.topic?.id;
    const sourceId = b.body.topic?.id;
    if (targetId && sourceId) {
      // A merge into itself must be refused, not silently half-applied.
      const selfMerge = await call('/api/v1/content/merge', { method: 'POST', body: JSON.stringify({ sourceId, targetId: sourceId }) });
      check('refuses to merge a topic into itself', selfMerge.status === 400, selfMerge.status);

      const merged = await call<{ movedCards: number; movedLessons: number; message: string }>('/api/v1/content/merge', {
        method: 'POST',
        body: JSON.stringify({ sourceId, targetId }),
      });
      check('merges 200', merged.status === 200, merged.status);
      check('moved both questions', merged.body.movedCards === 2, merged.body.movedCards);
      check('says what it did', typeof merged.body.message === 'string' && merged.body.message.length > 0, merged.body.message);

      const after = await call<{ lessons: unknown[]; cards: unknown[] }>(`/api/v1/content?topicId=${targetId}`);
      check('the notes and the questions now live together', after.status === 200 && after.body.lessons.length === 1 && after.body.cards.length === 2, {
        lessons: after.body.lessons?.length,
        cards: after.body.cards?.length,
      });

      const gone = await call(`/api/v1/content?topicId=${sourceId}`);
      check('the source topic is gone', gone.status === 404, gone.status);

      for (const id of [targetId, sourceId]) await call(`/api/v1/content?topicId=${id}`, { method: 'DELETE' });
      const cleaned = await call(`/api/v1/content?topicId=${targetId}`);
      check('scratch topics cleaned up', cleaned.status === 404, cleaned.status);
    }
  }

  // ── admin ─────────────────────────────────────────────────────────────────
  if (user.role === 'developer') {
    console.log('\nAdmin');
    const admin = await call<{ contentStats: Record<string, number>; subjects: unknown[] }>('/api/v1/admin');
    check('answers 200', admin.status === 200, admin.status);
    check('reports the shape of the library', typeof admin.body.contentStats?.cards === 'number', admin.body.contentStats);
    check('lists subjects', Array.isArray(admin.body.subjects));
  }

  console.log(failures === 0 ? '\nAll API checks passed.\n' : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
