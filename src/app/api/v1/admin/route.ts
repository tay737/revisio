import { NextRequest } from 'next/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { achievements, approvalRequests, cards, classMemberships, classes, featureFlags, lessons, profileBadges, subjects, userAchievements, userProfileBadges, users } from '@/db/schema';
import { revokeAllRefreshTokens } from '@/services/auth';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { isDeveloper } from '@/services/roles';
import { listSchedulers } from '@/domain/srs';
import { auditLog } from '@/db/schema';
import { seasons, seasonResults, topics } from '@/db/schema';
import { makeSlug, setTopicVisibility } from '@/services/content-ops';
import { invalidateSeasonCache } from '@/services/season-config';
import type { Visibility } from '@/services/visibility';

/** GET /admin — approvals, flags, algorithms, users, pending topics (developers only) */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  if (!isDeveloper(user)) throw new ApiError(403, 'forbidden', 'Developers only.');
  void user;

  const [approvals, flags, allUsers, pendingTopics, audits, topicCount, publicTopicCount, lessonCount, cardCount, publicCardCount, emptyTopicCount, subjectList, badgeRows, manualAchievements, userBadgeRows, userAchievementRows, classRows, classMemberRows] = await Promise.all([
    db
      .select({
        id: approvalRequests.id,
        userId: approvalRequests.userId,
        email: users.email,
        name: users.name,
        roleRequested: approvalRequests.roleRequested,
        note: approvalRequests.note,
        status: approvalRequests.status,
        createdAt: approvalRequests.createdAt,
      })
      .from(approvalRequests)
      .innerJoin(users, eq(approvalRequests.userId, users.id))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(100),
    db.select().from(featureFlags),
    db
      .select({
        id: users.id, email: users.email, name: users.name, role: users.role, status: users.status,
        emailVerifiedAt: users.emailVerifiedAt, totpEnabled: users.totpEnabled, createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(200),
    db.select().from(topics).where(eq(topics.visibility, 'pending_review')).limit(100),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(50),
    // The shape of the library, so "0 public questions" is stated at the top of
    // the page instead of being discovered by a student. That exact reading is
    // what this deployment was hiding: a subject page listing three topics and
    // not one answerable card anywhere in it.
    db.select({ n: sql<number>`count(*)::int` }).from(topics),
    db.select({ n: sql<number>`count(*)::int` }).from(topics).where(eq(topics.visibility, 'public')),
    db.select({ n: sql<number>`count(*)::int` }).from(lessons),
    db.select({ n: sql<number>`count(*)::int` }).from(cards),
    db.select({ n: sql<number>`count(*)::int` }).from(cards).where(eq(cards.visibility, 'public')),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(topics)
      .where(sql`not exists (select 1 from ${cards} c where c.topic_id = ${topics.id})`),
    db.select({ id: subjects.id, name: subjects.name, slug: subjects.slug, mathsEnabled: subjects.mathsEnabled }).from(subjects).orderBy(subjects.name),
    // Badges with a grant count, so the panel shows which are in use.
    db
      .select({
        id: profileBadges.id, slug: profileBadges.slug, label: profileBadges.label, icon: profileBadges.icon, color: profileBadges.color,
        grants: sql<number>`(select count(*)::int from ${userProfileBadges} g where g.badge_id = ${profileBadges.id})`,
      })
      .from(profileBadges)
      .orderBy(profileBadges.slug),
    // 'manual' achievements (alpha/beta tester) are never auto-evaluated;
    // this is the door a developer awards them through.
    db
      .select({ id: achievements.id, name: achievements.name, description: achievements.description, icon: achievements.icon })
      .from(achievements)
      .where(sql`${achievements.rule} ->> 'kind' = 'manual'`)
      .orderBy(achievements.id),
    // Grants per user, so the panel can show who currently wears what — the
    // table is the pick list's source of truth.
    db.select({ userId: userProfileBadges.userId, badgeId: userProfileBadges.badgeId }).from(userProfileBadges),
    db
      .select({ userId: userAchievements.userId, achievementId: userAchievements.achievementId })
      .from(userAchievements)
      .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
      .where(sql`${achievements.rule} ->> 'kind' = 'manual'`),
    // Every class with its owning teacher, so the panel can retune ownership
    // and see what it is deleting before it does.
    db
      .select({
        id: classes.id,
        name: classes.name,
        joinCode: classes.joinCode,
        teacherId: classes.teacherId,
        teacherName: users.name,
        subjectId: classes.subjectId,
        createdAt: classes.createdAt,
      })
      .from(classes)
      .innerJoin(users, eq(classes.teacherId, users.id))
      .orderBy(classes.name),
    // Rosters for the whole platform in one grouped query — the per-user class
    // pickers in the Users table read the same rows.
    db
      .select({ classId: classMemberships.classId, userId: classMemberships.userId, name: users.name, email: users.email })
      .from(classMemberships)
      .innerJoin(users, eq(classMemberships.userId, users.id)),
  ]);

  return ok({
    approvals,
    flags,
    algorithms: listSchedulers(),
    users: allUsers,
    pendingTopics,
    audit: audits,
    contentStats: {
      topics: topicCount[0]?.n ?? 0,
      publicTopics: publicTopicCount[0]?.n ?? 0,
      lessons: lessonCount[0]?.n ?? 0,
      cards: cardCount[0]?.n ?? 0,
      publicCards: publicCardCount[0]?.n ?? 0,
      emptyTopics: emptyTopicCount[0]?.n ?? 0,
    },
    subjects: subjectList,
    badges: badgeRows,
    manualAchievements,
    userBadges: userBadgeRows,
    userAchievements: userAchievementRows,
    classes: classRows.map((c) => ({
      id: c.id,
      name: c.name,
      joinCode: c.joinCode,
      teacherId: c.teacherId,
      teacherName: c.teacherName,
      subjectId: c.subjectId,
      members: classMemberRows.filter((m) => m.classId === c.id),
    })),
  });
});

/** POST /admin — approvals / flags / algorithms / user roles / topic review */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  if (!isDeveloper(user)) throw new ApiError(403, 'forbidden', 'Developers only.');
  const body = (await req.json()) as {
    action:
      | 'approve_request' | 'reject_request' | 'set_flag' | 'update_algorithm'
      | 'set_user_role' | 'suspend_user' | 'activate_user' | 'review_topic'
      | 'set_topic_visibility' | 'create_subject' | 'rename_subject'
      | 'set_subject_maths'
      | 'verify_user_email' | 'revoke_sessions' | 'delete_subject'
      | 'create_badge' | 'update_badge' | 'delete_badge'
      | 'grant_badge' | 'revoke_badge'
      | 'grant_achievement'
      | 'rename_class' | 'delete_class' | 'set_class_teacher' | 'set_class_subject'
      | 'add_class_member' | 'remove_class_member'
      | 'upsert_season' | 'set_season_state' | 'delete_season';
    approvalId?: string;
    flagKey?: string;
    enabled?: boolean;
    algorithm?: string;
    params?: Record<string, number>;
    userId?: string;
    role?: 'student' | 'teacher' | 'developer';
    topicId?: string;
    approveTopic?: boolean;
    visibility?: Visibility;
    subjectId?: string;
    name?: string;
    badgeId?: string;
    slug?: string;
    label?: string;
    icon?: string;
    color?: 'gold' | 'primary' | 'good' | 'rose';
    achievementId?: string;
    classId?: string;
    teacherId?: string;
    seasonNumber?: number;
    seasonName?: string | null;
    startsAt?: string;
    endsAt?: string;
    note?: string | null;
    rewards?: Record<string, { name: string; detail: string; icon: string }> | null;
    seasonState?: 'draft' | 'active' | 'closed';
    grandfatherRp?: boolean;
  };

  const audit = async (action: string, target: string, meta?: Record<string, unknown>) => {
    await db.insert(auditLog).values({ id: crypto.randomUUID(), actorId: user.id, action, target, meta });
  };

  switch (body.action) {
    case 'approve_request':
    case 'reject_request': {
      if (!body.approvalId) throw new ApiError(400, 'bad_request', 'approvalId required');
      const [r] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, body.approvalId)).limit(1);
      if (!r) throw new ApiError(404, 'not_found', 'Approval request not found.');
      if (r.status !== 'pending') throw new ApiError(409, 'conflict', 'Already decided.');
      const approved = body.action === 'approve_request';
      await db.update(approvalRequests).set({ status: approved ? 'approved' : 'rejected', reviewedBy: user.id, decidedAt: new Date() }).where(eq(approvalRequests.id, r.id));
      if (approved) await db.update(users).set({ role: r.roleRequested, status: 'active' }).where(eq(users.id, r.userId));
      await audit(body.action, r.id, { targetUser: r.userId, roleRequested: r.roleRequested });
      return ok({ ok: true });
    }
    case 'set_flag': {
      if (!body.flagKey) throw new ApiError(400, 'bad_request', 'flagKey required');
      await db.update(featureFlags).set({ enabled: body.enabled ?? false }).where(eq(featureFlags.key, body.flagKey));
      await audit('set_flag', body.flagKey, { enabled: body.enabled });
      return ok({ ok: true });
    }
    case 'update_algorithm': {
      // Algorithms keep params in the srs_algorithms feature flag payload; scheduler
      // registry is code (ARCHITECTURE.md §8). Changing default algorithm here.
      if (!body.algorithm) throw new ApiError(400, 'bad_request', 'algorithm required');
      const key = 'srs_algorithms';
      const [flag] = await db.select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
      let cfg: { default: string; params: Record<string, Record<string, number>> } = { default: 'sm2', params: {} };
      if (flag) {
        try { cfg = JSON.parse(flag.description) as typeof cfg; } catch { /* keep fallback */ }
      }
      cfg.default = body.algorithm;
      if (body.params) cfg.params = { ...cfg.params, [body.algorithm]: body.params };
      if (flag) {
        await db.update(featureFlags).set({ description: JSON.stringify(cfg) }).where(eq(featureFlags.key, key));
      } else {
        await db.insert(featureFlags).values({ key, description: JSON.stringify(cfg), enabled: true });
      }
      await audit('update_algorithm', body.algorithm, { params: body.params });
      return ok({ ok: true, config: cfg });
    }
    case 'set_user_role': {
      if (!body.userId || !body.role) throw new ApiError(400, 'bad_request', 'userId and role required');
      await db.update(users).set({ role: body.role }).where(eq(users.id, body.userId));
      await audit('set_user_role', body.userId, { role: body.role });
      return ok({ ok: true });
    }
    case 'suspend_user':
    case 'activate_user': {
      if (!body.userId) throw new ApiError(400, 'bad_request', 'userId required');
      await db.update(users).set({ status: body.action === 'suspend_user' ? 'suspended' : 'active' }).where(eq(users.id, body.userId));
      await audit(body.action, body.userId);
      return ok({ ok: true });
    }
    case 'review_topic': {
      if (!body.topicId) throw new ApiError(400, 'bad_request', 'topicId required');
      // Cascades to the lessons and cards, so approving a submitted topic makes
      // its questions answerable — the difference between a topic that reads as
      // published and one that is.
      const counts = await setTopicVisibility(user, body.topicId, body.approveTopic ? 'public' : 'private');
      await audit('review_topic', body.topicId, { approveTopic: body.approveTopic, ...counts });
      return ok({ ok: true, ...counts });
    }
    case 'set_topic_visibility': {
      if (!body.topicId || !body.visibility) throw new ApiError(400, 'bad_request', 'topicId and visibility required');
      const counts = await setTopicVisibility(user, body.topicId, body.visibility);
      await audit('set_topic_visibility', body.topicId, { visibility: body.visibility, ...counts });
      return ok({ ok: true, ...counts });
    }
    case 'create_subject': {
      if (!body.name) throw new ApiError(400, 'bad_request', 'name required');
      const slug = makeSlug(body.name);
      const [existing] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.slug, slug)).limit(1);
      if (existing) throw new ApiError(409, 'conflict', 'A subject with that name already exists.');
      const [subject] = await db.insert(subjects).values({ id: crypto.randomUUID(), name: body.name, slug }).returning();
      await audit('create_subject', subject.id, { name: body.name });
      return ok({ subject }, { status: 201 });
    }
    case 'rename_subject': {
      if (!body.subjectId || !body.name) throw new ApiError(400, 'bad_request', 'subjectId and name required');
      const [updated] = await db.update(subjects).set({ name: body.name }).where(eq(subjects.id, body.subjectId)).returning();
      if (!updated) throw new ApiError(404, 'not_found', 'Subject not found.');
      await audit('rename_subject', body.subjectId, { name: body.name });
      return ok({ subject: updated });
    }
    case 'set_subject_maths': {
      // Practice is a standalone tool — this flag changes nothing about the
      // SRS, the queue or reviews; it only opens /practice for the subject.
      if (!body.subjectId) throw new ApiError(400, 'bad_request', 'subjectId required');
      const [updated] = await db.update(subjects).set({ mathsEnabled: body.enabled ?? false }).where(eq(subjects.id, body.subjectId)).returning();
      if (!updated) throw new ApiError(404, 'not_found', 'Subject not found.');
      await audit('set_subject_maths', body.subjectId, { mathsEnabled: updated.mathsEnabled });
      return ok({ subject: updated });
    }
    case 'verify_user_email': {
      // Used when a learner is stuck: the verification email never arrived or
      // the link expired. Marks verified and activates in one move.
      if (!body.userId) throw new ApiError(400, 'bad_request', 'userId required');
      const [updated] = await db
        .update(users)
        .set({ emailVerifiedAt: new Date(), status: 'active' })
        .where(eq(users.id, body.userId))
        .returning({ id: users.id, email: users.email });
      if (!updated) throw new ApiError(404, 'not_found', 'User not found.');
      await audit('verify_user_email', body.userId);
      return ok({ ok: true });
    }
    case 'revoke_sessions': {
      // For a compromised or shared account: every refresh token dies, so all
      // devices are signed out at their next refresh. Nothing else changes.
      if (!body.userId) throw new ApiError(400, 'bad_request', 'userId required');
      await revokeAllRefreshTokens(body.userId);
      await audit('revoke_sessions', body.userId);
      return ok({ ok: true });
    }
    case 'delete_subject': {
      // Cascades to its topics, lessons, cards, classes and enrolments — the
      // whole subtree. The client confirms before calling; the audit row keeps
      // the record of what was removed.
      if (!body.subjectId) throw new ApiError(400, 'bad_request', 'subjectId required');
      const topicRows = await db.select({ id: topics.id }).from(topics).where(eq(topics.subjectId, body.subjectId));
      if (topicRows.length > 0) {
        // Count the cards inside, for the record.
        const cardRows = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(cards)
          .where(inArray(cards.topicId, topicRows.map((t) => t.id)));
        await audit('delete_subject', body.subjectId, { topics: topicRows.length, cards: cardRows[0]?.n ?? 0 });
      } else {
        await audit('delete_subject', body.subjectId, { topics: 0 });
      }
      const [deleted] = await db.delete(subjects).where(eq(subjects.id, body.subjectId)).returning({ id: subjects.id, name: subjects.name });
      if (!deleted) throw new ApiError(404, 'not_found', 'Subject not found.');
      return ok({ deleted: true });
    }

    // ── profile badges ────────────────────────────────────────────────────
    // A badge is minted once (unique slug) and granted many times; revoking
    // deletes the grant, never the badge. Every change is audited with the
    // label, because '<3' in an audit log beats a uuid.
    case 'create_badge': {
      const label = (body.label ?? '').trim();
      const slug = (body.slug ?? '').trim().toLowerCase();
      if (!label || !/^[a-z0-9][a-z0-9-]{0,30}$/.test(slug)) {
        throw new ApiError(400, 'bad_request', 'A label and a slug (lowercase letters, numbers, hyphens) are required.');
      }
      if (label.length > 24) throw new ApiError(400, 'bad_request', 'Badge labels are 24 characters or fewer.');
      const icon = (body.icon ?? '').trim();
      const color = body.color ?? 'gold';
      const [existing] = await db.select({ id: profileBadges.id }).from(profileBadges).where(eq(profileBadges.slug, slug)).limit(1);
      if (existing) throw new ApiError(409, 'conflict', 'A badge with that slug already exists.');
      const [badge] = await db.insert(profileBadges).values({ id: crypto.randomUUID(), slug, label, icon, color }).returning();
      await audit('create_badge', badge.id, { slug, label, color });
      return ok({ badge }, { status: 201 });
    }
    case 'update_badge': {
      if (!body.badgeId) throw new ApiError(400, 'bad_request', 'badgeId required');
      const patch: Record<string, unknown> = {};
      if (body.label !== undefined) {
        const label = body.label.trim();
        if (!label || label.length > 24) throw new ApiError(400, 'bad_request', 'Badge labels are 1–24 characters.');
        patch.label = label;
      }
      if (body.icon !== undefined) patch.icon = body.icon.trim();
      if (body.color !== undefined) patch.color = body.color;
      if (Object.keys(patch).length === 0) throw new ApiError(400, 'bad_request', 'Nothing to update.');
      const [updated] = await db.update(profileBadges).set(patch).where(eq(profileBadges.id, body.badgeId)).returning();
      if (!updated) throw new ApiError(404, 'not_found', 'Badge not found.');
      await audit('update_badge', updated.id, patch);
      return ok({ badge: updated });
    }
    case 'delete_badge': {
      if (!body.badgeId) throw new ApiError(400, 'bad_request', 'badgeId required');
      // Grants cascade, so every profile loses the chip at once — the client
      // confirms before calling.
      const [deleted] = await db.delete(profileBadges).where(eq(profileBadges.id, body.badgeId)).returning({ label: profileBadges.label });
      if (!deleted) throw new ApiError(404, 'not_found', 'Badge not found.');
      await audit('delete_badge', body.badgeId, { label: deleted.label });
      return ok({ deleted: true });
    }
    case 'grant_badge': {
      if (!body.badgeId || !body.userId) throw new ApiError(400, 'bad_request', 'badgeId and userId required');
      await db
        .insert(userProfileBadges)
        .values({ userId: body.userId, badgeId: body.badgeId, grantedBy: user.id })
        .onConflictDoNothing();
      await audit('grant_badge', body.badgeId, { user: body.userId, by: user.id });
      return ok({ ok: true });
    }
    case 'revoke_badge': {
      if (!body.badgeId || !body.userId) throw new ApiError(400, 'bad_request', 'badgeId and userId required');
      await db.delete(userProfileBadges).where(sql`${userProfileBadges.userId} = ${body.userId} and ${userProfileBadges.badgeId} = ${body.badgeId}`);
      await audit('revoke_badge', body.badgeId, { user: body.userId });
      return ok({ ok: true });
    }

    // ── classes (developer-side management) ─────────────────────────────
    // Membership changes are single-row and idempotent where it matters;
    // deleting a class cascades to its memberships, so the audit row keeps
    // the roster size for the record.
    case 'rename_class': {
      const name = (body.name ?? '').trim();
      if (!body.classId || !name) throw new ApiError(400, 'bad_request', 'classId and name required');
      if (name.length > 80) throw new ApiError(400, 'bad_request', 'Class names are 80 characters or fewer.');
      const [updated] = await db.update(classes).set({ name }).where(eq(classes.id, body.classId)).returning();
      if (!updated) throw new ApiError(404, 'not_found', 'Class not found.');
      await audit('rename_class', updated.id, { name });
      return ok({ class: updated });
    }
    case 'delete_class': {
      if (!body.classId) throw new ApiError(400, 'bad_request', 'classId required');
      const [cls] = await db.select().from(classes).where(eq(classes.id, body.classId)).limit(1);
      if (!cls) throw new ApiError(404, 'not_found', 'Class not found.');
      const memberRows = await db.select({ n: sql<number>`count(*)::int` }).from(classMemberships).where(eq(classMemberships.classId, cls.id));
      await db.delete(classes).where(eq(classes.id, cls.id));
      await audit('delete_class', cls.id, { name: cls.name, members: memberRows[0]?.n ?? 0 });
      return ok({ deleted: true });
    }
    case 'set_class_teacher': {
      if (!body.classId || !body.teacherId) throw new ApiError(400, 'bad_request', 'classId and teacherId required');
      const [next] = await db.select({ id: users.id, role: users.role, name: users.name }).from(users).where(eq(users.id, body.teacherId)).limit(1);
      if (!next) throw new ApiError(404, 'not_found', 'User not found.');
      if (next.role === 'student') throw new ApiError(400, 'bad_request', 'A class needs a teacher or developer as its owner.');
      const [updated] = await db.update(classes).set({ teacherId: next.id }).where(eq(classes.id, body.classId)).returning();
      if (!updated) throw new ApiError(404, 'not_found', 'Class not found.');
      await audit('set_class_teacher', updated.id, { teacher: next.id, teacherName: next.name });
      return ok({ class: updated });
    }
    case 'set_class_subject': {
      if (!body.classId || !body.subjectId) throw new ApiError(400, 'bad_request', 'classId and subjectId required');
      const [sub] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, body.subjectId)).limit(1);
      if (!sub) throw new ApiError(404, 'not_found', 'Subject not found.');
      const [updated] = await db.update(classes).set({ subjectId: sub.id }).where(eq(classes.id, body.classId)).returning();
      if (!updated) throw new ApiError(404, 'not_found', 'Class not found.');
      await audit('set_class_subject', updated.id, { subjectId: sub.id });
      return ok({ class: updated });
    }
    case 'add_class_member': {
      if (!body.classId || !body.userId) throw new ApiError(400, 'bad_request', 'classId and userId required');
      const [cls] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, body.classId)).limit(1);
      if (!cls) throw new ApiError(404, 'not_found', 'Class not found.');
      await db.insert(classMemberships).values({ classId: body.classId, userId: body.userId }).onConflictDoNothing();
      await audit('add_class_member', body.classId, { user: body.userId });
      return ok({ ok: true });
    }
    case 'remove_class_member': {
      if (!body.classId || !body.userId) throw new ApiError(400, 'bad_request', 'classId and userId required');
      await db
        .delete(classMemberships)
        .where(sql`${classMemberships.classId} = ${body.classId} and ${classMemberships.userId} = ${body.userId}`);
      await audit('remove_class_member', body.classId, { user: body.userId });
      return ok({ ok: true });
    }

    // ── manual achievements (alpha/beta tester) ───────────────────────────
    case 'grant_achievement': {
      // Manual-rule achievements are never auto-evaluated; this is the only
      // way one lands. Granting to an already-holder is a quiet no-op.
      if (!body.achievementId || !body.userId) throw new ApiError(400, 'bad_request', 'achievementId and userId required');
      const [ach] = await db.select().from(achievements).where(eq(achievements.id, body.achievementId)).limit(1);
      if (!ach) throw new ApiError(404, 'not_found', 'Achievement not found.');
      if (ach.rule.kind !== 'manual') throw new ApiError(400, 'bad_request', 'Only manual achievements can be granted here.');
      await db
        .insert(userAchievements)
        .values({ userId: body.userId, achievementId: ach.id })
        .onConflictDoNothing();
      await audit('grant_achievement', ach.id, { user: body.userId });
      return ok({ ok: true });
    }
    // ── seasons ──────────────────────────────────────────────────────────
    // The windows that decide everybody's rank. Handled here rather than
    // through a feature flag because a flag is a boolean and these are dates:
    // an operator has to be able to stretch a season over a holiday, name it,
    // or open the next one early.
    case 'upsert_season': {
      const number = Number(body.seasonNumber);
      if (!Number.isInteger(number) || number < 1) {
        throw new ApiError(400, 'bad_request', 'Which season? Send its number.');
      }
      const startsAt = parseUtc(body.startsAt, 'startsAt');
      const endsAt = parseUtc(body.endsAt, 'endsAt');
      if (endsAt <= startsAt) {
        throw new ApiError(400, 'bad_request', 'A season has to end after it starts.');
      }
      // A window that overlaps another season would leave two rows whose XP
      // aggregates both claim the same days, and `seasonAt` would have to pick
      // a winner. Refuse rather than resolve silently.
      const clash = await db
        .select({ number: seasons.number })
        .from(seasons)
        .where(and(sql`${seasons.number} <> ${number}`, sql`${seasons.startsAt} < ${endsAt}`, sql`${seasons.endsAt} > ${startsAt}`));
      if (clash.length > 0) {
        throw new ApiError(
          409,
          'conflict',
          `Those dates overlap season ${clash.map((c) => c.number).join(', ')}.`,
        );
      }

      const values = {
        name: body.seasonName ?? null,
        startsAt,
        endsAt,
        note: body.note ?? null,
        rewards: body.rewards ?? null,
        // Only written when the panel sends it, so a caller that has not heard
        // about the flag cannot silently clear it on season 1.
        ...(typeof body.grandfatherRp === 'boolean' ? { grandfatherRp: body.grandfatherRp } : {}),
        updatedAt: new Date(),
      };
      await db
        .insert(seasons)
        .values({ number, ...values, state: body.seasonState ?? 'draft' })
        .onConflictDoUpdate({ target: seasons.number, set: { ...values, ...(body.seasonState ? { state: body.seasonState } : {}) } });
      invalidateSeasonCache();
      await audit('upsert_season', String(number), {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        name: body.seasonName ?? null,
      });
      return ok({ ok: true, seasonNumber: number });
    }
    case 'set_season_state': {
      const number = Number(body.seasonNumber);
      const state = body.seasonState;
      if (!Number.isInteger(number) || number < 1 || !state) {
        throw new ApiError(400, 'bad_request', 'seasonNumber and seasonState required');
      }
      // The partial unique index `seasons_single_active` enforces one live
      // season in the database. Clearing it here first turns what would be an
      // opaque 23505 into a deliberate close-then-open.
      if (state === 'active') {
        await db.update(seasons).set({ state: 'closed' }).where(and(eq(seasons.state, 'active'), sql`${seasons.number} <> ${number}`));
      }
      const [updated] = await db
        .update(seasons)
        .set({ state, updatedAt: new Date() })
        .where(eq(seasons.number, number))
        .returning({ number: seasons.number });
      if (!updated) throw new ApiError(404, 'not_found', 'No such season.');
      invalidateSeasonCache();
      await audit('set_season_state', String(number), { state });
      return ok({ ok: true });
    }
    case 'delete_season': {
      const number = Number(body.seasonNumber);
      if (!Number.isInteger(number) || number < 1) {
        throw new ApiError(400, 'bad_request', 'seasonNumber required');
      }
      const [row] = await db.select().from(seasons).where(eq(seasons.number, number)).limit(1);
      if (!row) return ok({ ok: true, alreadyGone: true });
      // A season learners have finished in is a record they can be shown; a
      // SELECT COUNT is cheaper and clearer than letting the FK decide.
      const [used] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(seasonResults)
        .where(eq(seasonResults.seasonNumber, number));
      if (Number(used?.c ?? 0) > 0) {
        throw new ApiError(
          409,
          'conflict',
          `${used?.c} learner(s) have a recorded result for season ${number}. Close it instead of deleting it.`,
        );
      }
      await db.delete(seasons).where(eq(seasons.number, number));
      invalidateSeasonCache();
      await audit('delete_season', String(number));
      return ok({ ok: true });
    }

    default:
      throw new ApiError(400, 'bad_request', 'Unknown action.');
  }
});

/**
 * A `datetime-local` value from the admin panel, as a UTC instant.
 *
 * The panel sends `2026-10-02T00:00` — no zone — and the product defines a
 * season in UTC, so the missing zone is filled in as UTC rather than read as
 * the operator's browser offset. Getting this wrong would silently shift every
 * learner's season XP by however far the developer was from Greenwich.
 */
function parseUtc(value: string | undefined, field: string): Date {
  if (!value) throw new ApiError(400, 'bad_request', `${field} required`);
  const d = new Date(/[Zz]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, 'bad_request', `${field} is not a date`);
  return d;
}
