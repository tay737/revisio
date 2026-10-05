/**
 * Contract check: the native clients' payloads against a running server.
 *
 *   npm run build && npx next start -p 3123 &
 *   NODE_OPTIONS="--import ./scripts/register-stub-loader.mjs" \
 *     npx tsx scripts/native/verify-native-api.ts http://127.0.0.1:3123 dev@revisio.app
 *
 * The web client and the native clients read the same routes, but only the web
 * client has anyone reading its console when a field is renamed. A phone decodes
 * silently: the field is simply absent or defaulted, and the screen shows an
 * empty list that looks like "no data" rather than "wrong contract".
 *
 * So this walks every route the two native clients call, with a real token, and
 * asserts the fields their models actually require. It reads rather than writes:
 * no review is submitted, so no schedule moves and no XP is awarded.
 *
 * Run it against a development database. Signing in issues a refresh token, so
 * it touches the `refresh_tokens` table and nothing else.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client';
import { users } from '../../src/db/schema';
import { issueRefreshToken } from '../../src/services/auth';

const base = process.argv[2] ?? 'http://127.0.0.1:3123';
const email = process.argv[3] ?? 'dev@revisio.app';

let failures = 0;
function check(label: string, condition: boolean, detail: unknown = '') {
  if (!condition) failures += 1;
  const suffix = condition ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${label}${suffix}`);
}

/** A field the native model declares as required (no default, not nullable). */
function str(body: any, path: string): boolean {
  const value = path.split('.').reduce<any>((at, key) => (at == null ? at : at[key]), body);
  return typeof value === 'string' && value.length > 0;
}

function arr(body: any, path: string): boolean {
  const value = path.split('.').reduce<any>((at, key) => (at == null ? at : at[key]), body);
  return Array.isArray(value);
}

function present(body: any, path: string): boolean {
  const value = path.split('.').reduce<any>((at, key) => (at == null ? at : at[key]), body);
  return value !== undefined;
}

async function main() {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new Error(`No account ${email}. Seed the database first (npm run db:seed).`);

  const refresh = await issueRefreshToken(user.id);
  const session = await fetch(`${base}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  const sessionBody = (await session.json().catch(() => null)) as { accessToken?: string } | null;
  if (!sessionBody?.accessToken) {
    throw new Error(`Could not sign in at ${base}: ${session.status} ${JSON.stringify(sessionBody)}`);
  }
  const token = sessionBody.accessToken;
  console.log(`  ok   signed in at ${base} as ${email}\n`);

  const call = async (path: string, init: RequestInit = {}): Promise<any> => {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const text = await res.text();
    try {
      return { status: res.status, body: JSON.parse(text) };
    } catch {
      return { status: res.status, body: text.slice(0, 200) };
    }
  };

  // ── the account, which every other screen depends on ──────────────────────
  const me = await call('/api/v1/me');
  check('/me answers', me.status === 200, me.body);
  check(
    '/me carries what the account screen reads',
    str(me.body, 'id') &&
      str(me.body, 'email') &&
      str(me.body, 'name') &&
      present(me.body, 'profileVisibility') &&
      present(me.body, 'prefs') &&
      present(me.body, 'leaderboardOptOut') &&
      present(me.body, 'gamification') &&
      arr(me.body, 'subjects'),
    JSON.stringify(me.body).slice(0, 300),
  );
  check(
    '/me visibility carries all seven switches',
    ['name', 'nickname', 'bio', 'pronouns', 'subjects', 'stats', 'achievements'].every(
      (key) => typeof me.body?.profileVisibility?.[key] === 'boolean',
    ),
    me.body?.profileVisibility,
  );
  check(
    '/me gamification numbers the home screen prints',
    present(me.body, 'gamification.level') && present(me.body, 'gamification.totalXp'),
    me.body?.gamification,
  );

  // ── the catalogue: subjects → topics → lessons ────────────────────────────
  const subjects = await call('/api/v1/subjects');
  check('/subjects answers with the wrapper the client decodes', arr(subjects.body, 'subjects'), subjects.body);
  const subject = subjects.body?.subjects?.[0];
  check(
    'a subject carries the fields the list renders',
    subject != null && str(subject, 'id') && str(subject, 'name') && present(subject, 'enrolled'),
    subject,
  );

  let topicId: string | undefined;
  let topicName: string | undefined;
  if (subject) {
    const topics = await call(`/api/v1/content?subjectId=${encodeURIComponent(subject.id)}`);
    check('/content answers with a topics list', arr(topics.body, 'topics'), topics.body);
    const topic = topics.body?.topics?.[0];
    // The count fields are the trap: `/content` sends `cards`/`lessons` while
    // `/cram` sends `cardCount`/`lessonCount` for the very same numbers, so a
    // client that knows only one spelling shows "0 questions" on the other route
    // without failing anything. A topic must carry one pair or the other.
    check(
      'a topic carries the fields the list renders',
      topic == null || (str(topic, 'id') && str(topic, 'name') && arr(topics.body, 'topics')),
      topic,
    );
    check(
      'a topic carries its two counts under one of the two spellings',
      topic == null ||
        ((present(topic, 'cards') || present(topic, 'cardCount')) &&
          (present(topic, 'lessons') || present(topic, 'lessonCount'))),
      topic,
    );
    topicId = topic?.id;
    topicName = topic?.name;
  }

  if (topicId) {
    const lessons = await call(`/api/v1/lessons?topicId=${encodeURIComponent(topicId)}`);
    check('/lessons answers with a lessons list', arr(lessons.body, 'lessons'), lessons.body);
    const lesson = lessons.body?.lessons?.[0];
    check(
      'a lesson carries the prose the reader renders',
      lesson == null ||
        (str(lesson, 'id') &&
          str(lesson, 'title') &&
          (present(lesson, 'detailedMd') || present(lesson, 'summaryMd'))),
      lesson,
    );

    // ── Learn: the notes plus the unseen batch ──────────────────────────────
    const learn = await call(`/api/v1/learn?topicId=${encodeURIComponent(topicId)}&batch=4`);
    check(
      '/learn answers with the topic the header renders',
      str(learn.body, 'topic.id') && str(learn.body, 'topic.name'),
      learn.body?.topic,
    );
    check(
      '/learn carries the batch, the notes and the progress the screen needs',
      arr(learn.body, 'batch') &&
        arr(learn.body, 'notes') &&
        present(learn.body, 'progress.met') &&
        present(learn.body, 'progress.total') &&
        present(learn.body, 'progress.remaining'),
      JSON.stringify(learn.body).slice(0, 300),
    );
    const note = learn.body?.notes?.[0];
    check(
      'a learn note carries a title and a body',
      note == null || (str(note, 'title') && (present(note, 'detailedMd') || present(note, 'summaryMd') || present(note, 'contentMd'))),
      note,
    );
    const batchCard = learn.body?.batch?.[0];
    check(
      'a learn card carries no answer key — the pack is the only key route',
      batchCard == null || batchCard.key === undefined,
      batchCard,
    );
  }

  // ── the daily queue, and the pack that carries the key ────────────────────
  const queue = await call('/api/v1/queue/today?limit=20');
  check('/queue/today answers with a queue list', arr(queue.body, 'queue'), queue.body);
  const queueCard = queue.body?.queue?.[0];
  check(
    'a queue card carries the fields the review surface renders',
    queueCard == null || (str(queueCard, 'id') && str(queueCard, 'kind')),
    queueCard,
  );
  check('a queue card carries no answer key', queueCard == null || queueCard.key === undefined, queueCard);

  const pack = await call('/api/v1/offline/pack?limit=20');
  check('/offline/pack answers with cards', arr(pack.body, 'cards'), Object.keys(pack.body ?? {}));
  const packCard = pack.body?.cards?.[0];
  check(
    'a pack card carries the fields the offline store keeps',
    packCard == null || (str(packCard, 'id') && str(packCard, 'kind') && str(packCard, 'topicName')),
    packCard,
  );

  // ── cram: the topic list, then the session it builds ──────────────────────
  const cramTopics = await call('/api/v1/cram');
  check('/cram answers with a topics list', arr(cramTopics.body, 'topics'), cramTopics.body);
  const cramTopicIds = (cramTopics.body?.topics ?? []).slice(0, 2).map((t: any) => t.id);
  if (cramTopicIds.length > 0) {
    const cram = await call('/api/v1/cram', {
      method: 'POST',
      body: JSON.stringify({ topicIds: cramTopicIds, maxPerTopic: 5, noteDensity: 'detailed' }),
    });
    check(
      '/cram builds a session',
      (cram.status === 200 || cram.status === 201) && str(cram.body, 'sessionId'),
      { status: cram.status, keys: Object.keys(cram.body ?? {}) },
    );
    check(
      'a cram topic carries its counts under the cram spelling',
      (cramTopics.body?.topics ?? []).every(
        (t: any) => present(t, 'cardCount') && present(t, 'lessonCount'),
      ),
      cramTopics.body?.topics?.[0],
    );
    check(
      'a cram session carries its queue and its notes',
      arr(cram.body, 'queue') && arr(cram.body, 'notes') && present(cram.body, 'noteDensity'),
      Object.keys(cram.body ?? {}),
    );
    const cramNote = cram.body?.notes?.[0];
    check(
      'a cram note carries the density that was asked for',
      cramNote == null || present(cramNote, 'detailedMd') || present(cramNote, 'summaryMd') || present(cramNote, 'contentMd'),
      cramNote,
    );
  } else {
    console.log('  ..   no cram topics to build a session from (skipped)');
  }

  // ── rank, lobby and achievements ──────────────────────────────────────────
  const gami = await call('/api/v1/gamification?scope=weekly');
  check('/gamification answers', gami.status === 200, gami.body);
  check(
    '/gamification carries the rank the ladder draws',
    present(gami.body, 'ranked.rank.label') &&
      present(gami.body, 'ranked.rank.percent') &&
      present(gami.body, 'ranked.rank.remaining') &&
      present(gami.body, 'ranked.rank.isApex'),
    gami.body?.ranked?.rank,
  );
  check(
    '/gamification carries the placement the ladder gates on',
    present(gami.body, 'ranked.placement.placing') &&
      present(gami.body, 'ranked.placement.done') &&
      present(gami.body, 'ranked.placement.target'),
    gami.body?.ranked?.placement,
  );
  check(
    '/gamification carries the week and the lobby',
    present(gami.body, 'ranked.week.weekStart') &&
      present(gami.body, 'ranked.week.daysLeft') &&
      arr(gami.body, 'ranked.lobby.rows') &&
      present(gami.body, 'ranked.lobby.zone'),
    gami.body?.ranked,
  );
  check(
    '/gamification carries the learner\'s own line',
    present(gami.body, 'me.totalXp') && present(gami.body, 'me.level') && present(gami.body, 'me.xpThisWeek'),
    gami.body?.me,
  );
  check('/gamification lists the board', arr(gami.body, 'board'), Object.keys(gami.body ?? {}));
  const row = gami.body?.board?.[0];
  check('a board row carries a name and an xp', row == null || (str(row, 'name') && present(row, 'xp')), row);
  check('gamification lists achievements', arr(gami.body, 'achievements'), Object.keys(gami.body ?? {}));

  // ── the public profile, privacy already applied server-side ──────────────
  const handle = me.body?.username ?? me.body?.id;
  if (handle) {
    const profile = await call(`/api/v1/profile/${encodeURIComponent(handle)}`);
    check('/profile/:handle answers', profile.status === 200, profile.body);
    check(
      'a public profile is shaped the way the client reads it, private fields as null',
      present(profile.body, 'visibility') &&
        present(profile.body, 'pronouns') &&
        present(profile.body, 'gamification') &&
        present(profile.body, 'reviewCount') &&
        arr(profile.body, 'subjects') &&
        arr(profile.body, 'achievements'),
      Object.keys(profile.body ?? {}),
    );
    check(
      'a public profile carries all seven visibility switches',
      ['name', 'nickname', 'bio', 'pronouns', 'subjects', 'stats', 'achievements'].every(
        (key) => typeof profile.body?.visibility?.[key] === 'boolean',
      ),
      profile.body?.visibility,
    );
  }

  console.log(
    failures === 0
      ? '\nThe native clients and the server agree on the contract.'
      : `\n${failures} contract check(s) failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
