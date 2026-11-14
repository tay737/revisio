import 'server-only';

import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, refreshTokens, emailTokens, userSubjects, userAchievements, cardUserStates, streaks, approvalRequests, mediaAssets } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { issueDeletionConfirmation, verifyDeletionConfirmation } from '@/services/data-deletion';
import { deleteMediaObject } from '@/services/storage';

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


/** The tables that reference `users` and must be cleared before `users` is. */
const CASCADE_AFTER_USERS = [
  userSubjects,
  userAchievements,
  cardUserStates,
  streaks,
  approvalRequests,
  emailTokens,
  refreshTokens,
];

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
  // `banner_url` are nulled below, which removes the address of an uploaded
  // image but leaves the object in the bucket; a stored photograph surviving a
  // deletion request is not deletion of it. The ledger names every object this
  // account uploaded (both kinds), so it is read before the row is anonymised,
  // and each row is removed only once its object is actually gone.
  //
  // A row that survives a failed delete is deliberate: it is the only record
  // that a file outlived the account, and deleting it would turn a bucket
  // failure into silence. `media_assets` is therefore not in the cascade list
  // above - the loop owns it.
  const uploads = await db
    .select({ key: mediaAssets.key })
    .from(mediaAssets)
    .where(eq(mediaAssets.userId, user.id));
  // One retry covers the transient case (a blip, a dropped connection). A
  // second failure is neither allowed to abort the erasure - the learner loses
  // their name, email and every other field because storage hiccuped - nor
  // swallowed: the row stays and is stamped, so the ledger is the queue and a
  // retry job needs no second table.
  const stranded: string[] = [];
  for (const upload of uploads) {
    const removed =
      (await deleteMediaObject(upload.key)) || (await deleteMediaObject(upload.key));
    if (!removed) {
      await db
        .update(mediaAssets)
        .set({ deleteFailedAt: new Date() })
        .where(and(eq(mediaAssets.userId, user.id), eq(mediaAssets.key, upload.key)));
      stranded.push(upload.key);
      continue;
    }
    await db
      .delete(mediaAssets)
      .where(and(eq(mediaAssets.userId, user.id), eq(mediaAssets.key, upload.key)));
  }
  if (stranded.length) {
    console.error(
      `[data-deletion] ${stranded.length} object(s) still in the bucket for ${user.id}; rows stamped delete_failed_at`,
    );
  }

  await db.transaction(async (tx) => {
    // Revoke refresh tokens using the same transaction, then clear attached
    // records before the user row is anonymised.
    await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, user.id));
    for (const table of CASCADE_AFTER_USERS) {
      await tx.delete(table).where(eq(table.userId, user.id));
    }

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
