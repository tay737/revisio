import { NextRequest } from 'next/server';
import { readMediaObject } from '@/services/storage';

// ── The assets proxy ────────────────────────────────────────────────────────
// The media bucket is private; this is the only door. Object keys are
// app-minted (`u/<userId>/<kind>-<random>.<ext>`) — unguessable, so media is
// world-readable in the way an unlisted image is: a profile visitor (including
// a signed-out one) can see it, but nobody can enumerate or walk the bucket.
// The path check rejects anything that is not an app-minted key.
//
// GET /api/v1/assets/u/<userId>/avatar-abc123.png
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const m = url.pathname.match(/\/api\/v1\/assets\/(.+)$/);
  const key = m?.[1] ? decodeURIComponent(m[1]) : '';
  if (!key || !key.startsWith('u/') || key.includes('..')) {
    return new Response('Not found', { status: 404 });
  }

  const object = await readMediaObject(key);
  if (!object) return new Response('Not found', { status: 404 });

  return new Response(object.body, {
    headers: {
      'content-type': object.contentType,
      'cache-control': 'public, max-age=604800, immutable',
    },
  });
}

export const runtime = 'nodejs';
