'use client';

// Tiny authenticated fetch helper: keeps the access token in memory,
// transparently refreshes once on 401, then retries the original request.

export type SessionUser = { id: string; email: string; name: string; role: 'student' | 'teacher' | 'developer'; status: string };

let accessToken: string | null = null;

/**
 * What a refresh attempt actually told us.
 *
 * `rejected` means the refresh token is genuinely no good and the session is
 * over. `unavailable` means we could not find out — a 5xx, a capacity refusal,
 * a dropped network. The difference matters enormously: treating the second as
 * the first is what signed people out mid-session when the database was merely
 * busy, and then made every subsequent attempt look like a fresh failure.
 */
type RefreshOutcome = 'ok' | 'rejected' | 'unavailable';

let refreshPromise: Promise<RefreshOutcome> | null = null;

export function setToken(token: string | null) {
  accessToken = token;
}

export function getToken() {
  return accessToken;
}

async function tryRefresh(): Promise<RefreshOutcome> {
  if (!refreshPromise) {
    refreshPromise = (async (): Promise<RefreshOutcome> => {
      try {
        const res = await fetch('/api/v1/auth/refresh', { method: 'POST' });
        if (res.status === 401 || res.status === 403) return 'rejected';
        if (!res.ok) return 'unavailable';
        const data = (await res.json().catch(() => null)) as { accessToken?: string } | null;
        if (!data?.accessToken) return 'rejected';
        accessToken = data.accessToken;
        return 'ok';
      } catch {
        return 'unavailable';
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export class ApiClientError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Shown whenever the server is reachable but temporarily unable to work. */
const BUSY_MESSAGE = 'We could not reach the server just now. Try that again in a moment.';

async function request<T>(path: string, init: RequestInit & { retry?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers });

  if (res.status === 401 && !init.retry) {
    const outcome = await tryRefresh();
    if (outcome === 'ok') return request<T>(path, { ...init, retry: true });
    if (outcome === 'rejected') {
      setToken(null);
      throw new ApiClientError(401, 'unauthorized', 'Your session has ended. Sign in again.');
    }
    // We never heard back. Keep the session and say so — retrying is the user's
    // call, and they should still be signed in when they make it.
    throw new ApiClientError(503, 'capacity', BUSY_MESSAGE);
  }

  // A busy database is worth one quiet retry, but only for reads: replaying a
  // write we are not sure landed could award XP twice, so a write is left for
  // the user to repeat deliberately.
  const method = (init.method ?? 'GET').toUpperCase();
  if (res.status === 503 && !init.retry && method === 'GET') {
    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500));
    return request<T>(path, { ...init, retry: true });
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    if (!res.ok) throw new ApiClientError(res.status, 'error', `Request failed (${res.status}).`);
    return (await res.blob()) as unknown as T;
  }
  const data = await res.json();
  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string } }).error;
    throw new ApiClientError(res.status, err?.code ?? 'error', err?.message ?? 'Request failed.');
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
  raw: (path: string) => request<Blob>(path),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** Force a download of an authenticated endpoint (transcript exports). */
export async function downloadFile(path: string, filename: string) {
  const blob = await api.raw(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
