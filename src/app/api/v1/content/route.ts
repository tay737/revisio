import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { cards, cardAnswers, lessons, topics } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { canManageContent } from '@/services/roles';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'topic';
}

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
  const staff = canManageContent(user);
  const visibility = staff ? 'public' : body.publish ? 'pending_review' : 'private';

  const [topic] = await db
    .insert(topics)
    .values({
      id: crypto.randomUUID(),
      subjectId: body.subjectId,
      name: body.name,
      slug: `${staff ? 'staff' : 'user'}-${slugify(body.name)}-${user.id.slice(0, 8)}-${Date.now().toString(36)}`,
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
      if (!c.textWithBlank?.includes('____')) throw new ApiError(400, 'bad_request', 'cloze cards need ____ in textWithBlank');
      await db.insert(cards).values({ id: cardId, topicId: topic.id, lessonId: c.lessonId ?? null, kind: 'cloze', textWithBlank: c.textWithBlank, explanationMd: c.explanationMd ?? '', visibility, ownerId: topic.ownerId });
      await db.insert(cardAnswers).values((c.answers ?? []).map((text, i) => ({ id: crypto.randomUUID(), cardId, text, isPrimary: i === 0 })));
    } else if (c.kind === 'flashcard') {
      await db.insert(cards).values({ id: cardId, topicId: topic.id, lessonId: c.lessonId ?? null, kind: 'flashcard', prompt: c.prompt ?? '', explanationMd: c.explanationMd ?? '', visibility, ownerId: topic.ownerId });
      await db.insert(cardAnswers).values({
        id: crypto.randomUUID(), cardId, text: c.answers?.[0] ?? '', isPrimary: true,
        keywords: c.keywords ?? null, minPoints: c.minPoints ?? null,
      });
    } else {
      if (!c.options || c.options.length < 2) throw new ApiError(400, 'bad_request', 'mcq needs at least 2 options');
      await db.insert(cards).values({
        id: cardId, topicId: topic.id, lessonId: c.lessonId ?? null, kind: 'mcq', question: c.question ?? '',
        options: c.options.map((text, i) => ({ id: `o${i}`, text })), correctOptionId: `o${c.correctIdx ?? 0}`,
        explanationMd: c.explanationMd ?? '', visibility, ownerId: topic.ownerId,
      });
    }
  }

  return ok({ topic, lessons: lessonRows }, { status: 201 });
});

/** GET /content?mine=1 — my topics (any visibility) */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const mine = await db.select().from(topics).where(eq(topics.ownerId, user.id));
  return ok({ topics: mine });
});
