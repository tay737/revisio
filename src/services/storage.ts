import 'server-only';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { mediaAssets } from '@/db/schema';
import { ApiError } from '@/services/api';

// ── Media storage ───────────────────────────────────────────────────────────
// Neon's S3-compatible object store (forcePathStyle + a custom endpoint —
// the credentials are for that store, not AWS proper). The browser uploads
// straight to the bucket through a presigned PUT, so image bytes never pass
// through a serverless function; this module only mints URLs, records the
// ledger row and deletes on replace.
//
// Serving goes through GET /api/v1/assets/<key>, which proxies the object
// with long-lived cache headers — the bucket is private, so no public URL
// ever leaks.

const ENDPOINT = process.env.AWS_ENDPOINT_URL_S3;
const REGION = process.env.AWS_REGION ?? 'eu-central-1';
/** Neon object storage presents one project-scoped bucket. */
const BUCKET = process.env.AWS_S3_BUCKET ?? 'assets';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const KINDS = ['avatar', 'banner'] as const;
export type MediaKind = (typeof KINDS)[number];

const CONTENT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
};

/** The upload gate: type whitelist + size cap, checked before any presign. */
export function mediaConfigured(): boolean {
  return Boolean(ENDPOINT && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

function client(): S3Client {
  if (!mediaConfigured()) throw new ApiError(503, 'storage_unconfigured', 'Media storage is not configured.');
  return new S3Client({
    region: REGION,
    endpoint: ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

/** Origins the bucket must accept browser uploads from. */
const UPLOAD_ORIGINS = [
  'https://revisio-srs.vercel.app',
  'https://revisio-tay737.vercel.app',
  'http://localhost:3100',
  'http://localhost:3000',
];

const BUCKET_CORS = { CORSRules: [{
  AllowedOrigins: UPLOAD_ORIGINS,
  AllowedMethods: ['PUT', 'GET'],
  AllowedHeaders: ['content-type'],
  MaxAgeSeconds: 3600,
}] };

let bucketChecked: Promise<void> | null = null;

/**
 * The bucket is the one piece of the media path nothing else provisions: the
 * Neon integration creates its default bucket, but the app uploads into its
 * own, and a missing bucket or a bucket without CORS turns every upload into
 * a browser-side "Failed to fetch" — the preflight is answered 403 before a
 * byte moves, and the server logs stay silent. So presign self-heals: ensure
 * the bucket exists and answers preflights, once per process, before minting
 * a URL. A bucket that exists and already passes HEAD is one cheap call; the
 * CORS check runs only when the bucket had to be created.
 */
async function ensureBucket(): Promise<void> {
  if (!bucketChecked) {
    bucketChecked = (async () => {
      const s3 = client();
      try {
        await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
        return;
      } catch {
        // Missing (or invisible to us) — create it and teach it CORS.
      }
      try {
        await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
      } catch (e) {
        const name = (e as { name?: string }).name;
        if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw e;
      }
      await s3.send(new PutBucketCorsCommand({ Bucket: BUCKET, CORSConfiguration: BUCKET_CORS }));
      console.log(`[storage] created bucket "${BUCKET}" with upload CORS`);
    })().catch((e) => {
      bucketChecked = null; // retry next presign rather than caching a failure
      throw e;
    });
  }
  return bucketChecked;
}

export function contentTypeFor(ext: string): string | null {
  const map: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif' };
  return map[ext.toLowerCase()] ?? null;
}

/**
 * Mint a presigned PUT for one upload. The key embeds the user id and a
 * random suffix, so one user can never write over another's object even if
 * a token leaks: the key is the authority, not the bucket ACL.
 */
export async function presignMediaUpload(userId: string, kind: MediaKind, contentType: string, sizeBytes: number) {
  const ext = Object.entries(CONTENT_TYPES).find(([ct]) => ct === contentType)?.[1];
  if (!ext) throw new ApiError(415, 'bad_type', 'Avatars and banners must be PNG, JPEG or GIF.');
  if (sizeBytes <= 0 || sizeBytes > MAX_IMAGE_BYTES) {
    throw new ApiError(413, 'too_large', `Images must be between 1 byte and ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`);
  }
  const key = `u/${userId}/${kind}-${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await ensureBucket();
  const url = await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 600 },
  );
  return { key, url, contentType, sizeBytes };
}

/** Record a successful upload in the ledger. */
export async function recordMediaAsset(input: { userId: string; kind: MediaKind; key: string; contentType: string; sizeBytes: number }) {
  const row = {
    id: crypto.randomUUID(),
    userId: input.userId,
    kind: input.kind,
    key: input.key,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  };
  await db.insert(mediaAssets).values(row).onConflictDoNothing();
  return row;
}

/** The public (app-proxied) URL for a stored object. */
export function publicUrlFor(key: string): string {
  return `/api/v1/assets/${key}`;
}

/** Delete one object (best-effort — the ledger row is the source of truth). */
export async function deleteMediaObject(key: string): Promise<void> {
  if (!mediaConfigured()) return;
  try {
    await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (e) {
    console.error('[storage] delete failed for', key, e);
  }
}

/**
 * Replace a profile image: record the new object and clear any previous one
 * of the same kind owned by the user. Old bytes are deleted after the ledger
 * no longer references them.
 */
export async function replaceProfileImage(userId: string, kind: MediaKind, asset: { key: string; contentType: string; sizeBytes: number }) {
  const [previous] = await db
    .select({ key: mediaAssets.key })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.userId, userId), eq(mediaAssets.kind, kind)))
    .limit(1);
  await recordMediaAsset({ userId, kind, ...asset });
  if (previous && previous.key !== asset.key) {
    await deleteMediaObject(previous.key);
    await db.delete(mediaAssets).where(and(eq(mediaAssets.userId, userId), eq(mediaAssets.key, previous.key)));
  }
}

/** Stream one object for the assets proxy route. */
export async function readMediaObject(key: string): Promise<{ body: ReadableStream; contentType: string } | null> {
  if (!mediaConfigured()) return null;
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (!res.Body) return null;
    return { body: res.Body as unknown as ReadableStream, contentType: res.ContentType ?? 'application/octet-stream' };
  } catch {
    return null;
  }
}
