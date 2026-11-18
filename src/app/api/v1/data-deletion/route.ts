import 'server-only';

import { NextRequest } from 'next/server';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  users, refreshTokens, emailTokens, userSubjects, userAchievements, cardUserStates, streaks,
  approvalRequests, mediaAssets, streakEvents, notificationPrefs, notifications,
  notificationDeliveries, examPlans, userChallenges, userGoals, referralCodes,
  deckSubscriptions, classMemberships, studyConnections, guardianLinks,
  referralRedemptions, leagueMemberships, seasonResults, userTopicStates, imports,
  cramSessions, userProfileBadges, reviewLogs, xpEvents, examAttempts,
  subjects, topics, lessons, cards, mathSets, examQuestions, examPapers,
  classes, classAssignments,
} from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { issueDeletionConfirmation, verifyDeletionConfirmation } from '@/services/data-deletion';
import { deleteAccountMediaObjects } from '@/services/media-erasure';

// ┌─────────────────────────────────────────────────────────────────────────┐
// │  GDPR data-deletion endpoint                                           │
// │                                                                         │
// │  `DELETE /api/v1/data-deletion`                                        │
// │                                                                         │
// │  Anonymises the caller's personal data and cascades the cascade in the  │
// │  order the tables depend on. The caller is always identified by the    │
// │  session — never by a client-supplied id.                               │
// │                                                                         │
// │  Ordering matters because the mirror triggers capture `to_jsonb(NEW)`,  │
// │  so every table that can be re-derived from a deleted parent must be    │
// │  cleared *before* the parent row goes. This ordering is the one that   │
// │  keeps the mirror in step; it is the same order `src/db/sync.ts` drains │
// │  and re-creates rows.                                                 │
// │                                                                         │
// │  Deletion scope and retention remain a separate product/legal review;  │
// │  this endpoint preserves its existing anonymisation and cascade rules. │
// └─────────────────────────────────────────────────────────────────────────┘


/** The tables that reference `users` and must be cleared before `users` is.
 *  Because the user row is anonymised rather than deleted, the FK cascades
 *  never fire — every user-keyed table has to be named here. DPO erasure
 *  ruling (Amendment A): learning records go too — review_logs, xp_events and
 *  exam_attempts are pseudonymous-keyed free text and count as personal data.
 *  audit_log.actor_id is the documented retained-with-justification exception. */
const CASCADE_AFTER_USERS = [
  userSubjects,
  userAchievements,
  cardUserStates,
  userTopicStates,
  streaks,
  streakEvents,
  approvalRequests,
  emailTokens,
  refreshTokens,
  notificationPrefs,
  notifications,
  // Deliveries carry the recipient address inside `detail` — deleting the row
  // is the only way the email leaves with the account.
  notificationDeliveries,
  examPlans,
  userChallenges,
  userGoals,
  referralCodes,
  deckSubscriptions,
  classMemberships,
  leagueMemberships,
  seasonResults,
  imports,
  cramSessions,
  userProfileBadges,
  reviewLogs,
  xpEvents,
  examAttempts,
];

/** Tables keyed by a user on *both* ends — severed symmetrically so neither
 *  side keeps a live link to (or stats about) the deleted account. */
const CASCADE_BY_PAIR = [
  {
    table: studyConnections,
    columns: [studyConnections.requesterId, studyConnections.addresseeId],
  },
  {
    table: guardianLinks,
    columns: [guardianLinks.studentId, guardianLinks.guardianId],
  },
  {
    table: referralRedemptions,
    columns: [referralRedemptions.referrerUserId, referralRedemptions.referredUserId],
  },
] as const;

export const DELETE = route(async (req: NextRequest) => {
  // The caller is identified by their session and the destructive request
  // must carry a signed, short-lived challenge issued by this endpoint.
  const user = await requireUser(req);

  const suppliedConfirmation = req.headers.get('x-data-deletion-confirm');
  if (!suppliedConfirmation) {
    // Return a short-lived, user-bound challenge; the server enforces its
    // expiry and account binding on the destructive request below.
    const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, user.id)).limit(1);
    if (!row?.email) throw new ApiError(404, 'account_not_found', 'Account not found.');
    const secret = process.env.AUTH_SECRET;
    if (!secret?.trim()) throw new ApiError(503, 'confirmation_unavailable', 'Account deletion confirmation is temporarily unavailable.');
    const issued = issueDeletionConfirmation(user.id, secret);
    return ok({
      confirm: true,
      message: 'This will anonymise your account and remove selected account records. Some historical learning and class records may remain. This cannot be undone.',
      email: row?.email ?? null,
      expiresAt: new Date(issued.expiresAt).toISOString(),
      confirmationToken: issued.token,
    });
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret?.trim()) throw new ApiError(503, 'confirmation_unavailable', 'Account deletion confirmation is temporarily unavailable.');
  if (!verifyDeletionConfirmation(suppliedConfirmation, user.id, secret)) {
    throw new ApiError(403, 'deletion_confirmation_expired', 'That deletion confirmation has expired or is invalid. Request a new confirmation.');
  }

  // Erasure includes the bytes, not only the pointers. `avatar_url` and
  // `banner_url` are nulled inside the transaction below, which removes the
  // address of an uploaded image; the object itself is deleted from the bucket
  // AFTER the transaction commits. The order is the fix: deleting objects
  // first meant a failed anonymisation left the user row pointing at bytes
  // that were already gone. Now a failed transaction leaves objects, ledger
  // rows and pointers all intact for a clean retry.
  //
  // Inside the transaction every `media_assets` row is stamped
  // `delete_failed_at`: that stamp is the retry ledger, so even a crash between
  // commit and the bucket loop leaves a queue the retention cron's drain can
  // find. After commit the stamped set itself is read back — not a key list
  // captured beforehand — so an asset confirmed mid-flight is still covered —
  // and each object is removed (one retry covers a blip). A row is deleted
  // only once the object is actually gone; a row that survives keeps its
  // stamp — the ledger is the queue, and deleting it would turn a bucket
  // failure into silence.
  await db.transaction(async (tx) => {
    // Revoke refresh tokens using the same transaction, then clear attached
    // records before the user row is anonymised.
    await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, user.id));
    for (const table of CASCADE_AFTER_USERS) {
      await tx.delete(table).where(eq(table.userId, user.id));
    }
    for (const { table, columns } of CASCADE_BY_PAIR) {
      await tx.delete(table).where(or(...columns.map((c) => eq(c, user.id))));
    }

    // ownerId-keyed content (DPO Amendment B): private content is deleted;
    // shared (public/pending_review) content is retained with attribution
    // stripped. Deleting a private topic/subject cascades its own subtree via
    // the content FKs — private content is never visible to other owners, so
    // the cascade cannot reach anyone else's rows.
    await tx.delete(cards).where(and(eq(cards.ownerId, user.id), eq(cards.visibility, 'private')));
    // Cards pinned to a private lesson have no FK to lessons — clear them first.
    await tx.delete(cards).where(inArray(cards.lessonId,
      tx.select({ id: lessons.id }).from(lessons)
        .where(and(eq(lessons.ownerId, user.id), eq(lessons.visibility, 'private')))));
    await tx.delete(lessons).where(and(eq(lessons.ownerId, user.id), eq(lessons.visibility, 'private')));
    await tx.delete(topics).where(and(eq(topics.ownerId, user.id), eq(topics.visibility, 'private')));
    await tx.delete(examQuestions).where(and(eq(examQuestions.ownerId, user.id), eq(examQuestions.visibility, 'private')));
    await tx.delete(examPapers).where(and(eq(examPapers.ownerId, user.id), eq(examPapers.visibility, 'private')));
    // math_sets has no visibility — an owned set is private by definition.
    await tx.delete(mathSets).where(eq(mathSets.ownerId, user.id));
    // Strip attribution from retained shared content BEFORE the subject pass:
    // ownerId is nullable, and stripping first means the survival check sees
    // the post-erasure topic set — a subject holding only the user's own
    // public topics must survive unattributed, not delete its subtree.
    for (const t of [topics, lessons, cards, examQuestions, examPapers] as const) {
      await tx.update(t).set({ ownerId: null }).where(and(eq(t.ownerId, user.id), sql`${t.visibility} <> 'private'`));
    }
    // Owned subjects go only when nothing references them any more. Every
    // child below cascades on subject delete — topics (with their lessons,
    // cards, questions and sets), exam papers, classes and other learners'
    // enrollments — so "empty" means empty across all of them, not just
    // foreign-owned topics.
    const ownedSubjects = await tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.ownerId, user.id));
    for (const s of ownedSubjects) {
      const countIn = async (table: typeof topics | typeof examPapers | typeof classes | typeof userSubjects) => {
        const [row] = await tx.select({ c: sql<number>`count(*)::int` }).from(table).where(eq(table.subjectId, s.id));
        return row?.c ?? 0;
      };
      const remaining =
        (await countIn(topics)) + (await countIn(examPapers)) + (await countIn(classes)) + (await countIn(userSubjects));
      if (remaining === 0) {
        await tx.delete(subjects).where(eq(subjects.id, s.id));
      } else {
        await tx.update(subjects).set({ ownerId: null }).where(eq(subjects.id, s.id));
      }
    }

    // Teacher/creator provenance (DPO item B): classes and assignments are
    // shared structures — null the attribution, keep the content readable.
    await tx.update(classes).set({ teacherId: null }).where(eq(classes.teacherId, user.id));
    await tx.update(classAssignments).set({ createdBy: null }).where(eq(classAssignments.createdBy, user.id));

    // Every uploaded object is now queued for byte deletion: the stamp is the
    // ledger a retry job reads. Successful deletes below remove the row; only
    // genuine bucket failures keep it.
    await tx
      .update(mediaAssets)
      .set({ deleteFailedAt: new Date() })
      .where(eq(mediaAssets.userId, user.id));

    await tx.update(users).set({
      status: 'deleted',
      email: `deleted+${user.id}@invalid.example`,
      name: 'Deleted account',
      username: null,
      nickname: null,
      bio: null,
      pronouns: null,
      avatarEmoji: null,
      avatarColor: 'ink',
      avatarUrl: null,
      bannerUrl: null,
      bannerColor: 'dusk',
      pendingEmail: null,
      profileVisibility: {
        name: false,
        nickname: false,
        bio: false,
        pronouns: false,
        subjects: false,
        stats: false,
        achievements: false,
      } as const,
      totpSecret: null,
      totpEnabled: false,
      recoveryCodes: [],
      consent: {},
      ageConsent: false,
      dateOfBirth: null,
      passwordHash: `deleted:${crypto.randomUUID()}`,
    }).where(eq(users.id, user.id));
  });

  // The anonymisation is committed, so the pointers are already gone — now the
  // bytes go. One retry covers the transient case (a blip, a dropped
  // connection). A second failure is neither allowed to abort the erasure nor
  // swallowed: the row keeps its `delete_failed_at` stamp from the transaction
  // and stays as the queue the retention drain reads.
  const stranded = await deleteAccountMediaObjects(user.id);
  if (stranded.length) {
    console.error(
      `[data-deletion] ${stranded.length} object(s) still in the bucket for ${user.id}; rows stamped delete_failed_at`,
    );
  }

  // The message tracks what actually happened. Images that survived a bucket
  // failure are queued, not gone, and saying otherwise is the one claim this
  // endpoint cannot make.
  return ok({
    deleted: true,
    mediaQueued: stranded.length,
    message:
      stranded.length === 0
        ? 'Your account has been anonymised and selected account records have been removed. You will not be able to sign in again.'
        : stranded.length === 1
          ? 'Your account has been anonymised and selected account records have been removed. 1 uploaded image is queued for removal because storage was unavailable; its record stays until it is removed, and you can email us to confirm it is gone. You will not be able to sign in again.'
          : `Your account has been anonymised and selected account records have been removed. ${stranded.length} uploaded images are queued for removal because storage was unavailable; their records stay until they are removed, and you can email us to confirm they are gone. You will not be able to sign in again.`,
  });
});
