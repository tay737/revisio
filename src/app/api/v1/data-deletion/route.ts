import 'server-only';

import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { issueDeletionConfirmation, verifyDeletionConfirmation } from '@/services/data-deletion';
import { eraseUserAccount } from '@/services/account-erasure';

// ┌─────────────────────────────────────────────────────────────────────────┐
// │  GDPR data-deletion endpoint                                           │
// │                                                                         │
// │  `DELETE /api/v1/data-deletion`                                        │
// │                                                                         │
// │  Anonymises the caller's personal data and cascades the cascade in the  │
// │  order the tables depend on. The caller is always identified by the    │
// │  session — never by a client-supplied id.                               │
// │                                                                         │
// │  The erasure itself lives in `services/account-erasure.ts` so admin     │
// │  cleanup scripts run the identical transaction; the ordering rationale │
// │  is documented there.                                                 │
// └─────────────────────────────────────────────────────────────────────────┘

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

  const { mediaQueued: strandedCount } = await eraseUserAccount(user.id);
  if (strandedCount) {
    console.error(
      `[data-deletion] ${strandedCount} object(s) still in the bucket for ${user.id}; rows stamped delete_failed_at`,
    );
  }

  // The message tracks what actually happened. Images that survived a bucket
  // failure are queued, not gone, and saying otherwise is the one claim this
  // endpoint cannot make.
  return ok({
    deleted: true,
    mediaQueued: strandedCount,
    message:
      strandedCount === 0
        ? 'Your account has been anonymised and selected account records have been removed. You will not be able to sign in again.'
        : strandedCount === 1
          ? 'Your account has been anonymised and selected account records have been removed. 1 uploaded image is queued for removal because storage was unavailable; its record stays until it is removed, and you can email us to confirm it is gone. You will not be able to sign in again.'
          : `Your account has been anonymised and selected account records have been removed. ${strandedCount} uploaded images are queued for removal because storage was unavailable; their records stay until they are removed, and you can email us to confirm they are gone. You will not be able to sign in again.`,
  });
});
