'use client';

// Tiny authenticated fetch helper: keeps the access token in memory,
// transparently refreshes once on 401, then retries the original request.

export type SessionUser = { id: string; email: string; name: string; role: 'student' | 'teacher' | 'developer'; status: string };

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setToken(token: string | null) {
  accessToken = token;
}

export function getToken() {
  return accessToken;
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/v1/auth/refresh', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { accessToken?: string } | null) => {
        if (data?.accessToken) {
          accessToken = data.accessToken;
          return true;
        }
        return false;
      })
      .finally(() => {
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

async function request<T>(path: string, init: RequestInit & { retry?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers });

  if (res.status === 401 && !init.retry) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, { ...init, retry: true });
    setToken(null);
    throw new ApiClientError(401, 'unauthorized', 'Session expired.');
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
