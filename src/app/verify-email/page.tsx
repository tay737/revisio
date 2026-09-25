'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/icons';

type State =
  | { kind: 'verifying' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>(
    token ? { kind: 'verifying' } : { kind: 'error', message: 'That link is missing its verification token.' },
  );
  const [email, setEmail] = useState('');
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setState(
          res.ok ? { kind: 'done' } : { kind: 'error', message: data?.error?.message ?? 'We could not verify that link.' },
        );
      } catch {
        if (!cancelled) setState({ kind: 'error', message: 'We could not reach the server. Check your connection and try again.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const resend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    try {
      await fetch('/api/v1/auth/verify-email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } finally {
      setBusy(false);
      setResent(true);
    }
  };

  if (state.kind === 'verifying')
    return (
      <p className="px-6 py-10 text-center text-[14px] text-muted-foreground" role="status">
        Verifying…
      </p>
    );

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-6 py-14">
      <div aria-hidden className="absolute inset-x-0 top-0 h-[46%] bg-[#272729]" />

      <div className="relative w-full max-w-md">
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-2 text-[17px] font-semibold tracking-[-0.374px] text-white"
        >
          <span className="grid h-6 w-6 place-items-center rounded-[6px] bg-primary text-[11px] font-semibold text-primary-foreground">
            R
          </span>
          Revisio
        </Link>

        <div className="card p-7 text-center">
          {state.kind === 'done' ? (
            <>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-good/10 text-good">
                <Icon name="reviewed" size={22} />
              </span>
              <h1 className="t-tagline mt-4">Email verified</h1>
              <p className="t-caption mt-2 text-muted-foreground">
                Your account is active. Sign in and we will build today’s queue.
              </p>
              <Link href="/login" className="btn btn-primary mt-6 w-full">
                Sign in
              </Link>
            </>
          ) : (
            <>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
                <Icon name="due" size={22} />
              </span>
              <h1 className="t-tagline mt-4">That link didn’t work</h1>
              <p className="t-caption mt-2 text-muted-foreground">{state.message}</p>

              {resent ? (
                <p className="t-caption mt-5 rounded-[11px] bg-primary/10 px-3 py-2.5 text-primary">
                  If that address has an unverified account, a fresh link is on its way.
                </p>
              ) : (
                <form onSubmit={resend} className="mt-5 space-y-3 text-left">
                  <div className="relative">
                    <label className="label" htmlFor="resend-email">
                      Send me a new link
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-[13px] text-muted-foreground">
                        <Icon name="mail" size={17} />
                      </span>
                      <input
                        id="resend-email"
                        type="email"
                        required
                        className="input pl-11"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@school.edu"
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-secondary w-full gap-2" disabled={busy}>
                    <Icon name="rotate" size={16} />
                    {busy ? 'Sending…' : 'Re-send verification email'}
                  </button>
                </form>
              )}

              <Link href="/login" className="btn btn-primary mt-3 w-full">
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <p className="px-6 py-10 text-center text-[14px] text-muted-foreground" role="status">
          Verifying…
        </p>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
