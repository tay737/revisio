/**
 * End-to-end API check against a running server:
 *
 *   npm run build && npm start &            (or a preview server)
 *   NODE_OPTIONS="--import ./scripts/register-stub-loader.mjs" \
 *     npx tsx scripts/verify-api.ts http://127.0.0.1:3100 tayyab@outlook.jp
 *
 * It issues a refresh token in the database, exchanges it for an access token
 * *at the target*, then calls the routes the way the browser does. Reading the
 * code is not evidence that a route answers; this is.
 *
 * Authenticating through the deployment rather than signing locally is
 * deliberate: an access token is signed with the deployment's own AUTH_SECRET,
 * so a locally-signed one is rejected by production — and a refresh token is
 * just a database row, so this works against any environment pointed at the
 * same database.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { cardUserStates, users } from '../src/db/schema';
import { issueRefreshToken } from '../src/services/auth';

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

  const refresh = await issueRefreshToken(user.id);
  const session = await fetch(`${base}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  const sessionBody = (await session.json().catch(() => null)) as { accessToken?: string; user?: { email: string } } | null;
  if (!sessionBody?.accessToken) {
    throw new Error(`Could not sign in at ${base}: ${session.status} ${JSON.stringify(sessionBody)}`);
  }
  const token = sessionBody.accessToken;
  console.log(`  ok   signed in at the target as ${sessionBody.user?.email ?? email}`);

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

  // ── the one route every page load depends on ──────────────────────────────
  console.log('Session');
  const me = await call<{ id: string; role: string; today?: { due: number }; gamification?: { totalXp: number } }>('/api/v1/me');
  check('/me answers 200', me.status === 200, me.body);
  check('/me identifies the account', me.body.id === user.id, me.body.id);
  check('/me carries today counts', typeof me.body.today?.due === 'number', me.body.today);
  check('/me carries the learner snapshot', typeof me.body.gamification?.totalXp === 'number', me.body.gamification);

  // ── the study loop ────────────────────────────────────────────────────────
  console.log('Daily queue');
  const queue = await call<{ queue: { id: string; kind: string; topicName: string }[] }>('/api/v1/queue/today?limit=50');
  check('answers 200', queue.status === 200, queue.status);
  check('every card names its topic', (queue.body.queue ?? []).every((c) => Boolean(c.topicName)));

  // An empty queue is a legitimate state — a deck reviewed this morning is
  // genuinely not due until later — so the thing worth asserting is that the
  // two routes telling the same story agree. A queue that is empty while /me
  // says work is waiting (or the reverse) is the failure that matters.
  const dealt = queue.body.queue?.length ?? 0;
  check(
    'the queue agrees with the counts on /me',
    dealt === 0 === (me.body.today?.due === 0),
    { dealt, dueOnMe: me.body.today?.due },
  );

  // Proof that the queue still deals, independent of how much of the real deck
  // happens to be due: a fresh deck of two cards must come back with both.
  const seedSubject = (await call<{ topics: { subjectId: string }[] }>('/api/v1/content?mine=1')).body.topics?.[0]?.subjectId;
  const pickerSubjectId = seedSubject;
  if (seedSubject) {
    const seeded = await call<{ topic: { id: string } }>('/api/v1/content', {
      method: 'POST',
      body: JSON.stringify({
        subjectId: seedSubject,
        name: `verify-queue-${Date.now().toString(36)}`,
        cards: [
          { kind: 'cloze', textWithBlank: 'q ____ q', answers: ['w'] },
          { kind: 'cloze', textWithBlank: 'e ____ e', answers: ['r'] },
        ],
      }),
    });
    const seededId = seeded.body.topic?.id;
    check('a fresh deck was created', seeded.status === 201, seeded.status === 201 ? 'ok' : seeded.body);
    if (seededId) {
      const fresh = await call<{ queue: { id: string; topicId: string }[] }>('/api/v1/queue/today?limit=50');
      check('and the queue deals it', (fresh.body.queue ?? []).filter((c) => c.topicId === seededId).length === 2, fresh.body.queue?.length);
      await call(`/api/v1/content?topicId=${seededId}`, { method: 'DELETE' });
    }
  }

  console.log('\nCram');  const cramTopics = await call<{ topics: { id: string; name: string; cardCount: number }[] }>('/api/v1/cram');
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

  // ── first exposure: the Learn session ─────────────────────────────────────
  console.log('\nLearn session (first exposure)');

  // What the session introduces must be *unseen* material only. A daily review
  // of a card already met is a repeat; introducing one again would pay XP twice
  // for the same learning.
  // A first pass must never re-introduce something already met — that is the
  // card's own state row, and it is the only honest evidence available without
  // answering a card and mutating the deck.
  const met = await db.select({ cardId: cardUserStates.cardId }).from(cardUserStates).where(eq(cardUserStates.userId, user.id));
  const metIds = new Set(met.map((r) => r.cardId));

  for (const topic of withCards.slice(0, 3)) {
    const session = await call<{
      topic: { id: string; name: string };
      notes: { id: string }[];
      batch: { id: string; kind: string }[];
      progress: { met: number; total: number; remaining: number };
    }>(`/api/v1/learn?topicId=${topic.id}&batch=4`);
    check(`“${topic.name}” opens a first pass`, session.status === 200, session.status === 200 ? 'ok' : session.body);
    if (session.status !== 200) continue;

    const batch = session.body.batch ?? [];
    check('the batch is capped to what was asked for', batch.length <= 4, batch.length);
    // The exact promise: the first four cards this user has not met. Stated as a
    // property of the deck rather than an absolute count, so it holds whether the
    // account has met all of it or none — and a first pass that offered material
    // already earned would be re-teaching, so the equality is the point.
    check(
      'the batch is exactly the unseen cards, capped at four',
      batch.length === Math.min(4, session.body.progress.remaining),
      { dealt: batch.length, unseen: session.body.progress.remaining },
    );
    const repeats = batch.filter((c) => metIds.has(c.id));
    check('nothing already met is introduced again', repeats.length === 0, repeats.map((c) => c.id));
    check(
      'the batch never exceeds the topic',
      batch.length <= session.body.progress.total,
      { batch: batch.length, total: session.body.progress.total },
    );
    check(
      'unseen cards the batch left out are reported as remaining',
      session.body.progress.remaining >= batch.length,
      session.body.progress,
    );
    check(
      'progress counts the whole topic, not the batch',
      session.body.progress.met + session.body.progress.remaining === session.body.progress.total,
      session.body.progress,
    );
    check('progress agrees with the deck it just counted', session.body.progress.total >= topic.cardCount, {
      counted: session.body.progress.total,
      advertised: topic.cardCount,
    });
  }
  // Reading is part of the question here: a topic with notes must hand them over.
  const withNotes = await call<{ topics: { id: string; name: string; subjectId: string; lessonCount: number; cardCount: number }[] }>(
    '/api/v1/content?mine=1',
  );
  const notesTopic = (withNotes.body.topics ?? []).find((t) => t.lessonCount > 0 && t.cardCount > 0);
  if (notesTopic) {
    const session = await call<{ notes: unknown[] }>(`/api/v1/learn?topicId=${notesTopic.id}&batch=4`);
    check(
      `“${notesTopic.name}” brings its notes with the questions`,
      session.status === 200 && session.body.notes.length > 0,
      session.status === 200 ? session.body.notes.length : session.status,
    );
  } else {
    // Nothing on this account holds both yet, and the prompt-with-notes promise
    // is the whole point of a first pass — so build one, check it, remove it.
    const subjectId = withNotes.body.topics?.[0]?.subjectId;
    if (!subjectId) {
      console.log('  skip  no subject available to build one in');
    } else {
      const made = await call<{ topic: { id: string } }>('/api/v1/content', {
        method: 'POST',
        body: JSON.stringify({
          subjectId,
          name: `verify-firstpass-${Date.now().toString(36)}`,
          lessons: [{ title: 'Reading', detailedMd: 'the long form', summaryMd: 'the short form' }],
          cards: [
            { kind: 'cloze', textWithBlank: 'a ____ b', answers: ['c'] },
            { kind: 'cloze', textWithBlank: 'd ____ e', answers: ['f'] },
            { kind: 'cloze', textWithBlank: 'g ____ h', answers: ['i'] },
          ],
        }),
      });
      check('a topic with notes and questions was created', made.status === 201, made.status === 201 ? 'ok' : made.body);
      const madeId = made.body.topic?.id;
      if (madeId) {
        const session = await call<{
          notes: { title: string; summaryMd: string }[];
          batch: unknown[];
          progress: { met: number; total: number; remaining: number };
        }>(`/api/v1/learn?topicId=${madeId}&batch=2`);
        check('it opens a first pass', session.status === 200, session.status === 200 ? 'ok' : session.body);
        check('the notes come with the questions', session.body.notes?.length === 1, session.body.notes);
        check('the batch respects the size asked for', session.body.batch?.length === 2, session.body.batch?.length);
        check('progress counts all three cards', session.body.progress?.total === 3, session.body.progress);
        check('and none are met yet', session.body.progress?.met === 0 && session.body.progress?.remaining === 3, session.body.progress);
        await call(`/api/v1/content?topicId=${madeId}`, { method: 'DELETE' });
        const gone = await call(`/api/v1/content?topicId=${madeId}`);
        check('the scratch topic was removed', gone.status === 404, gone.status);
      }
    }
  }

  const noTopic = await call('/api/v1/learn');
  check('a first pass must name its topic', noTopic.status === 400, noTopic.status);

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

  // ── a malformed deck must be refused before it writes anything ───────────
  console.log('\nAuthoring guard rails');
  const guardSubject = pickerSubjectId;
  if (guardSubject) {
    const before = (await call<{ topics: unknown[] }>('/api/v1/content?mine=1')).body.topics?.length ?? 0;
    const bad = await call<{ error: { message: string } }>('/api/v1/content', {
      method: 'POST',
      body: JSON.stringify({
        subjectId: guardSubject,
        name: `verify-bad-${Date.now().toString(36)}`,
        cards: [{ kind: 'flashcard', prompt: 'An answerless flashcard' }],
      }),
    });
    check('an answerless flashcard is refused', bad.status === 400, bad.status);
    check('and the refusal explains what to send', /answers/.test(bad.body.error?.message ?? ''), bad.body.error?.message);

    const after = (await call<{ topics: unknown[] }>('/api/v1/content?mine=1')).body.topics?.length ?? 0;
    check('a refused deck leaves no empty topic behind', after === before, { before, after });

    const blank = await call('/api/v1/content', {
      method: 'POST',
      body: JSON.stringify({
        subjectId: guardSubject,
        name: `verify-blank-${Date.now().toString(36)}`,
        cards: [{ kind: 'cloze', textWithBlank: 'no blank marker here', answers: ['x'] }],
      }),
    });
    check('a fill-the-blank with no ____ is refused', blank.status === 400, blank.status);
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
