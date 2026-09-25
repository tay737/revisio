import { NextRequest } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { cards, cardAnswers, lessons, subjects, topics } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { canManageContent, isDeveloper } from '@/services/roles';
import { answersForCards, makeSlug, setTopicVisibility, topicContentCounts } from '@/services/content-ops';
import { reachesUser, topicReaches, type Visibility } from '@/services/visibility';

type CardInput = {
  kind: 'cloze' | 'flashcard' | 'mcq';
  textWithBlank?: string;
  prompt?: string;
  question?: string;
  answers?: string[];
  keywords?: { required: boolean; phrase: string; synonyms?: string[] }[];
  minPoints?: number;
  options?: string[];
  correctIdx?: number;
  explanationMd?: string;
  lessonId?: string;
};

type LessonInput = { title: string; detailedMd: string; summaryMd?: string; specRefs?: string };

/**
 * Reject a malformed deck before anything is written.
 *
 * The topic used to be inserted first, so a bad question halfway down the list
 * answered with an error *and* left an empty topic behind — which is one of the
 * ways an import ends up looking like it landed separately from the notes it
 * came with. Checking up front means a rejected import changes nothing at all.
 *
 * The flashcard case is the one that used to pass silently: a card created with
 * no answer is unanswerable, and it presented as a verdict reading "Answer:"
 * with nothing after it, which teaches the reader nothing and looks like the
 * app lost their content.
 */
function validateCards(input: CardInput[] | undefined) {
  for (const [i, c] of (input ?? []).entries()) {
    const at = `Question ${i + 1}`;
    if (c.kind === 'cloze') {
      if (!c.textWithBlank?.includes('____')) throw new ApiError(400, 'bad_request', `${at}: a fill-the-blank needs ____ where the blank goes.`);
      if (!c.answers?.some((a) => a.trim())) throw new ApiError(400, 'bad_request', `${at}: a fill-the-blank needs at least one accepted answer.`);
    } else if (c.kind === 'flashcard') {
      if (!c.prompt?.trim()) throw new ApiError(400, 'bad_request', `${at}: a flashcard needs a prompt.`);
      if (!c.answers?.some((a) => a.trim())) throw new ApiError(400, 'bad_request', `${at}: a flashcard needs its answer — send it as answers: ["…"].`);
    } else if (c.kind === 'mcq') {
      const options = c.options ?? [];
      if (options.length < 2) throw new ApiError(400, 'bad_request', `${at}: a multiple-choice question needs at least two options.`);
      if ((c.correctIdx ?? 0) < 0 || (c.correctIdx ?? 0) >= options.length) throw new ApiError(400, 'bad_request', `${at}: the correct option is outside the list of options.`);
    } else {
      throw new ApiError(400, 'bad_request', `${at}: kind must be cloze, flashcard or mcq.`);
    }
  }
}

/** POST /content — create topic with lessons/cards. Students → private (or
 *  pending_review when publishing); staff → public immediately. */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json()) as {
    subjectId?: string;
    name?: string;
    description?: string;
    publish?: boolean;
    lessons?: LessonInput[];
    cards?: CardInput[];
  };
  if (!body.name || !body.subjectId) throw new ApiError(400, 'bad_request', 'name and subjectId required');
  validateCards(body.cards);
  const staff = canManageContent(user);
  const visibility = staff ? 'public' : body.publish ? 'pending_review' : 'private';

  const [topic] = await db
    .insert(topics)
    .values({
      id: crypto.randomUUID(),
      subjectId: body.subjectId,
      name: body.name,
      slug: makeSlug(staff ? 'staff' : 'user', body.name, user.id.slice(0, 8), Date.now().toString(36)),
      description: body.description ?? '',
      visibility,
      ownerId: staff ? null : user.id,
    })
    .returning();

  const lessonRows: { id: string; title: string }[] = [];
  for (const [i, l] of (body.lessons ?? []).entries()) {
    const id = crypto.randomUUID();
    await db.insert(lessons).values({
      id, topicId: topic.id, title: l.title, detailedMd: l.detailedMd ?? '',
      summaryMd: l.summaryMd ?? '', specRefs: l.specRefs ?? '', visibility, ownerId: topic.ownerId, position: i,
    });
    lessonRows.push({ id, title: l.title });
  }

  for (const c of body.cards ?? []) {
    const cardId = crypto.randomUUID();
    if (c.kind === 'cloze') {
      await db.insert(cards).values({ id: cardId, topicId: topic.id, lessonId: c.lessonId ?? null, kind: 'cloze', textWithBlank: c.textWithBlank, explanationMd: c.explanationMd ?? '', visibility, ownerId: topic.ownerId });
      await db.insert(cardAnswers).values((c.answers ?? []).map((text, i) => ({ id: crypto.randomUUID(), cardId, text, isPrimary: i === 0 })));
    } else if (c.kind === 'flashcard') {
      await db.insert(cards).values({ id: cardId, topicId: topic.id, lessonId: c.lessonId ?? null, kind: 'flashcard', prompt: c.prompt ?? '', explanationMd: c.explanationMd ?? '', visibility, ownerId: topic.ownerId });
      await db.insert(cardAnswers).values({
        id: crypto.randomUUID(), cardId, text: c.answers?.[0] ?? '', isPrimary: true,
        keywords: c.keywords ?? null, minPoints: c.minPoints ?? null,
      });
    } else {
      await db.insert(cards).values({
        id: cardId, topicId: topic.id, lessonId: c.lessonId ?? null, kind: 'mcq', question: c.question ?? '',
        options: (c.options ?? []).map((text, i) => ({ id: `o${i}`, text })), correctOptionId: `o${c.correctIdx ?? 0}`,
        explanationMd: c.explanationMd ?? '', visibility, ownerId: topic.ownerId,
      });
    }
  }

  return ok({ topic, lessons: lessonRows }, { status: 201 });
});

/**
 * GET /content
 *
 *   ?topicId=…    one topic's full tree, with counts and answers for editors
 *   ?subjectId=…  the topics under a subject that this user may see
 *   ?mine=1       the topics this user may edit, with counts and subject names
 *
 * The subject form is what the Learn page asks for when a subject is expanded.
 * It previously fell through to the "mine" branch, so opening a subject showed
 * you your own topics instead of that subject's — the page looked functional
 * and listed the wrong things.
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const topicId = req.nextUrl.searchParams.get('topicId');
  const subjectId = req.nextUrl.searchParams.get('subjectId');
  const staff = canManageContent(user);

  if (topicId) {
    const [topic] = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1);
    if (!topic) throw new ApiError(404, 'not_found', 'Topic not found.');
    const mayEdit = staff || topic.ownerId === user.id;
    if (!mayEdit && !reachesUser(topic.visibility, topic.ownerId, user.id)) {
      throw new ApiError(404, 'not_found', 'Topic not found.');
    }

    const [topicLessons, topicCards] = await Promise.all([
      db.select().from(lessons).where(eq(lessons.topicId, topicId)).orderBy(asc(lessons.position)),
      db.select().from(cards).where(eq(cards.topicId, topicId)).orderBy(asc(cards.createdAt)),
    ]);
    // Only the answers for these cards. This used to select the whole
    // card_answers table on every topic open and filter it in JavaScript.
    const answers = await answersForCards(topicCards.map((c) => c.id));

    return ok({
      topic,
      mayEdit,
      lessons: mayEdit ? topicLessons : topicLessons.filter((l) => reachesUser(l.visibility, l.ownerId, user.id)),
      cards: topicCards
        .filter((c) => mayEdit || reachesUser(c.visibility, c.ownerId, user.id))
        .map((c) => ({
          ...c,
          answers: answers
            .filter((a) => a.cardId === c.id)
            .map((a) => ({ id: a.id, text: a.text, isPrimary: a.isPrimary, keywords: a.keywords, minPoints: a.minPoints })),
          // the correct option is only revealed to someone who can edit
          correctOptionId: mayEdit ? c.correctOptionId : undefined,
        })),
    });
  }

  if (subjectId) {
    const rows = await db
      .select()
      .from(topics)
      .where(and(eq(topics.subjectId, subjectId), topicReaches(user.id)))
      .orderBy(asc(topics.position), asc(topics.name));
    const counts = await topicContentCounts(user.id, rows.map((r) => r.id), { onlyReachable: true });
    return ok({ topics: rows.map((t) => ({ ...t, ...counts.get(t.id) })) });
  }

  const rows = isDeveloper(user)
    ? await db
        .select({ topic: topics, subjectName: subjects.name })
        .from(topics)
        .leftJoin(subjects, eq(topics.subjectId, subjects.id))
        .orderBy(asc(subjects.name), asc(topics.position))
    : await db
        .select({ topic: topics, subjectName: subjects.name })
        .from(topics)
        .leftJoin(subjects, eq(topics.subjectId, subjects.id))
        .where(eq(topics.ownerId, user.id))
        .orderBy(asc(topics.createdAt));

  // Counts are the *true* totals for staff, and reachable totals for everyone
  // else. An editor needs to know a topic holds twelve questions; whether they
  // may personally answer them is a different question, and answering it here
  // made every private deck read as empty to the person whose job is to fix it.
  const counts = await topicContentCounts(user.id, rows.map((r) => r.topic.id), { onlyReachable: !staff });
  return ok({
    topics: rows.map(({ topic, subjectName }) => ({
      ...topic,
      subjectName,
      cardCount: counts.get(topic.id)?.cards ?? 0,
      lessonCount: counts.get(topic.id)?.lessons ?? 0,
    })),
  });
});

/** PATCH /content — update a topic, lesson or card; `visibility` publishes a tree. */
export const PATCH = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json()) as {
    topicId?: string;
    lessonId?: string;
    cardId?: string;
    name?: string;
    description?: string;
    visibility?: Visibility;
    title?: string;
    detailedMd?: string;
    summaryMd?: string;
    specRefs?: string;
    textWithBlank?: string;
    prompt?: string;
    question?: string;
    explanationMd?: string;
    answers?: string[];
    options?: string[];
    correctIdx?: number;
    keywords?: { required: boolean; phrase: string; synonyms?: string[] }[];
    minPoints?: number;
  };
  const staff = canManageContent(user);

  const assertCanEditTopic = async (topicId: string) => {
    const [t] = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1);
    if (!t) throw new ApiError(404, 'not_found', 'Topic not found.');
    if (!staff && t.ownerId !== user.id) throw new ApiError(403, 'forbidden', 'Not your content.');
    return t;
  };

  // ── topic rename / description / visibility ──
  if (body.topicId && !body.lessonId && !body.cardId) {
    if (body.visibility) {
      await setTopicVisibility(user, body.topicId, body.visibility);
      return ok({ updated: true, published: body.visibility === 'public' });
    }
    await assertCanEditTopic(body.topicId);
    const update: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim();
    if (typeof body.description === 'string') update.description = body.description;
    if (Object.keys(update).length) await db.update(topics).set(update).where(eq(topics.id, body.topicId));
    return ok({ updated: true });
  }

  // ── lesson update ──
  if (body.lessonId) {
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, body.lessonId)).limit(1);
    if (!lesson) throw new ApiError(404, 'not_found', 'Lesson not found.');
    await assertCanEditTopic(lesson.topicId);
    const update: Record<string, unknown> = {};
    if (typeof body.title === 'string' && body.title.trim()) update.title = body.title.trim();
    if (typeof body.detailedMd === 'string') update.detailedMd = body.detailedMd;
    if (typeof body.summaryMd === 'string') update.summaryMd = body.summaryMd;
    if (typeof body.specRefs === 'string') update.specRefs = body.specRefs;
    if (Object.keys(update).length) await db.update(lessons).set(update).where(eq(lessons.id, body.lessonId));
    return ok({ updated: true });
  }

  // ── card update ──
  if (body.cardId) {
    const [card] = await db.select().from(cards).where(eq(cards.id, body.cardId)).limit(1);
    if (!card) throw new ApiError(404, 'not_found', 'Card not found.');
    await assertCanEditTopic(card.topicId);

    const update: Record<string, unknown> = {};
    if (typeof body.explanationMd === 'string') update.explanationMd = body.explanationMd;
    if (card.kind === 'cloze' && typeof body.textWithBlank === 'string') {
      if (!body.textWithBlank.includes('____')) throw new ApiError(400, 'bad_request', 'A fill-the-blank question needs ____ where the blank goes.');
      update.textWithBlank = body.textWithBlank;
    }
    if (card.kind === 'flashcard' && typeof body.prompt === 'string') update.prompt = body.prompt;
    if (card.kind === 'mcq') {
      if (typeof body.question === 'string') update.question = body.question;
      if (Array.isArray(body.options) && body.options.length >= 2) {
        update.options = body.options.map((text, i) => ({ id: `o${i}`, text }));
        if (typeof body.correctIdx === 'number') update.correctOptionId = `o${body.correctIdx}`;
      } else if (typeof body.correctIdx === 'number') {
        update.correctOptionId = `o${body.correctIdx}`;
      }
    }
    if (Object.keys(update).length) await db.update(cards).set(update).where(eq(cards.id, body.cardId));

    if (Array.isArray(body.answers)) {
      // An edit that empties the accepted answers makes the card unanswerable —
      // every attempt wrong forever. Refuse the empty list rather than wipe
      // what was there.
      if (!body.answers.some((a) => a.trim())) throw new ApiError(400, 'bad_request', 'A question needs at least one accepted answer.');
      if (card.kind === 'cloze') {
        await db.delete(cardAnswers).where(eq(cardAnswers.cardId, card.id));
        await db.insert(cardAnswers).values(body.answers.map((text, i) => ({ id: crypto.randomUUID(), cardId: card.id, text, isPrimary: i === 0 })));
      } else if (card.kind === 'flashcard') {
        const [existing] = await db.select().from(cardAnswers).where(eq(cardAnswers.cardId, card.id)).limit(1);
        const kw = body.keywords ?? null;
        const mp = typeof body.minPoints === 'number' ? body.minPoints : null;
        if (existing) {
          await db.update(cardAnswers).set({ text: body.answers[0] ?? '', keywords: kw, minPoints: mp }).where(eq(cardAnswers.id, existing.id));
        } else {
          await db.insert(cardAnswers).values({ id: crypto.randomUUID(), cardId: card.id, text: body.answers[0] ?? '', isPrimary: true, keywords: kw, minPoints: mp });
        }
      }
    } else if (card.kind === 'flashcard' && (body.keywords !== undefined || body.minPoints !== undefined)) {
      const [existing] = await db.select().from(cardAnswers).where(eq(cardAnswers.cardId, card.id)).limit(1);
      if (existing) {
        await db.update(cardAnswers).set({
          keywords: body.keywords ?? existing.keywords,
          minPoints: typeof body.minPoints === 'number' ? body.minPoints : existing.minPoints,
        }).where(eq(cardAnswers.id, existing.id));
      }
    }
    return ok({ updated: true });
  }

  throw new ApiError(400, 'bad_request', 'topicId, lessonId or cardId required');
});

/** DELETE /content?cardId=… | ?lessonId=… | ?topicId=… — remove content. */
export const DELETE = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const staff = canManageContent(user);
  const cardId = req.nextUrl.searchParams.get('cardId');
  const lessonId = req.nextUrl.searchParams.get('lessonId');
  const topicId = req.nextUrl.searchParams.get('topicId');

  const assertCanEditTopic = async (id: string) => {
    const [t] = await db.select().from(topics).where(eq(topics.id, id)).limit(1);
    if (!t) throw new ApiError(404, 'not_found', 'Topic not found.');
    if (!staff && t.ownerId !== user.id) throw new ApiError(403, 'forbidden', 'Not your content.');
    return t;
  };

  if (cardId) {
    const [card] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
    if (!card) throw new ApiError(404, 'not_found', 'Card not found.');
    await assertCanEditTopic(card.topicId);
    await db.delete(cardAnswers).where(eq(cardAnswers.cardId, cardId));
    await db.delete(cards).where(eq(cards.id, cardId));
    return ok({ deleted: true });
  }
  if (lessonId) {
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    if (!lesson) throw new ApiError(404, 'not_found', 'Lesson not found.');
    await assertCanEditTopic(lesson.topicId);
    await db.delete(lessons).where(eq(lessons.id, lessonId));
    return ok({ deleted: true });
  }
  if (topicId) {
    await assertCanEditTopic(topicId);
    // cascades handle lessons/cards/answers via FK
    await db.delete(topics).where(and(eq(topics.id, topicId)));
    return ok({ deleted: true });
  }
  throw new ApiError(400, 'bad_request', 'cardId, lessonId or topicId required');
});
