import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isCapacityError } from '@/db/client';
import { verifyAccessToken, type SessionUser, type Role } from '@/services/auth';

export type { SessionUser };

export const REFRESH_COOKIE = 'srs_refresh';

// The PWA work (public/sw.js) stopped the *service worker* from retaining
// private responses, but the browser's HTTP cache is a second retention layer
// the worker cannot reach: API responses were going out as
// `cache-control: public, max-age=0, must-revalidate`, which permits the bytes
// of an authenticated payload to sit in the disk cache and outlive the session
// — the exact shared-device leak the SW change was written to close. Every
// `/api/v1` document is dynamic and caller-specific, so the honest header is
// `private, no-store`: no storage, no revalidation dance, nothing to purge on
// logout. Static assets are unaffected (the assets proxy sets its own
// immutable caching, and Next serves `public/` files itself).
const PRIVATE_JSON_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

function privateJson(init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers);
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', PRIVATE_JSON_HEADERS['Cache-Control']);
  return { ...init, headers };
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, privateJson(init));
}

export function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, privateJson({ status }));
}

/** Extract bearer token from Authorization header. */
function bearer(req: NextRequest): string | null {
  const h = req.headers.get('authorization');
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

export async function getSession(req: NextRequest): Promise<SessionUser | null> {
  const token = bearer(req);
  if (!token) return null;
  return verifyAccessToken(token);
}

/** Require an authenticated (and optionally role-limited) user; throws ApiError. */
export async function requireUser(req: NextRequest, roles?: Role[]): Promise<SessionUser> {
  const user = await getSession(req);
  if (!user) throw new ApiError(401, 'unauthorized', 'Sign in required.');
  if (roles && user.status !== 'active') throw new ApiError(403, 'not_activated', 'Account not activated.');
  if (roles && !roles.includes(user.role)) throw new ApiError(403, 'forbidden', 'Insufficient permissions.');
  return user;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Wrap a route handler with uniform error handling. */
export function route(handler: (req: NextRequest, ctx: { params: Record<string, string> }) => Promise<Response>) {
  return async (req: NextRequest, ctx: { params: Record<string, string> }) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) return fail(e.status, e.code, e.message);
      // Capacity pressure is not a bug in the request and not a broken session —
      // it is a wait. Saying so (and saying it retryably) is the difference
      // between a user tapping again and a user believing the app has died.
      if (isCapacityError(e)) {
        console.error('[api] database is at capacity', e);
        return fail(503, 'capacity', 'The database is busy. Give it a moment and try again.');
      }
      console.error('[api]', e);
      return fail(500, 'internal', 'Unexpected server error.');
    }
  };
}

// ── cookies (refresh token; web client only) ────────────────────────────────

export async function setRefreshCookie(raw: string) {
  const store = await cookies();
  store.set(REFRESH_COOKIE, raw, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 86_400,
    path: '/',
  });
}

export async function clearRefreshCookie() {
  const store = await cookies();
  store.set(REFRESH_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' });
}
