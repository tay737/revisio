import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { publicUrlFor, presignMediaUpload, replaceProfileImage, mediaConfigured, KINDS, type MediaKind } from '@/services/storage';

// ── Profile media API ───────────────────────────────────────────────────────
// The browser asks for a presigned PUT, uploads the bytes straight to the
// bucket, then confirms. Confirmation is what swaps the user's avatar_url /
// banner_url — a presigned URL alone changes nothing, so an abandoned upload
// never half-lands. The previous image is deleted on confirm.

export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  if (!mediaConfigured()) throw new ApiError(503, 'storage_unconfigured', 'Media storage is not configured.');

  const body = (await req.json().catch(() => ({}))) as {
    action?: 'presign' | 'confirm' | 'remove';
    kind?: string;
    contentType?: string;
    sizeBytes?: number;
    key?: string;
  };
  const kind = KINDS.includes(body.kind as MediaKind) ? (body.kind as MediaKind) : null;
  if (!kind) throw new ApiError(400, 'bad_kind', 'kind must be avatar or banner.');

  switch (body.action ?? 'presign') {
    case 'presign': {
      const contentType = String(body.contentType ?? '');
      const sizeBytes = Math.round(Number(body.sizeBytes ?? 0));
      const presigned = await presignMediaUpload(user.id, kind, contentType, sizeBytes);
      return ok(presigned);
    }

    case 'confirm': {
      const key = String(body.key ?? '');
      if (!key.startsWith(`u/${user.id}/`)) throw new ApiError(403, 'not_yours', 'That object is not yours.');
      const contentType = String(body.contentType ?? '');
      const sizeBytes = Math.round(Number(body.sizeBytes ?? 0));
      await replaceProfileImage(user.id, kind, { key, contentType, sizeBytes });
      await db
        .update(users)
        .set(kind === 'avatar' ? { avatarUrl: publicUrlFor(key) } : { bannerUrl: publicUrlFor(key) })
        .where(eq(users.id, user.id));
      return ok({ url: publicUrlFor(key) });
    }

    case 'remove': {
      // Clear the pointer; the ledger row and old object go with the next
      // confirm that replaces this slot, or with admin cleanup.
      await db.update(users).set(kind === 'avatar' ? { avatarUrl: null } : { bannerUrl: null }).where(eq(users.id, user.id));
      return ok({ removed: true });
    }

    default:
      throw new ApiError(400, 'bad_request', 'Unknown action.');
  }
});
