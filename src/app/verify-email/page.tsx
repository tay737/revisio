'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { Icon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { buttonVariants } from '@/lib/button-variants';
import { cn } from '@/lib/utils';

type State =
  | { kind: 'verifying' }
  | { kind: 'done'; emailChange?: boolean }
  | { kind: 'error'; message: string };

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get('token');
  // Email-change links arrive as /verify-email?token=…&kind=email_change; the
  // token store keys on the kind, so the POST must echo it or the lookup misses.
  const kind = params.get('kind') === 'email_change' ? 'email_change' : undefined;
  const [state, setState] = useState<State>(
    token ? { kind: 'verifying' } : { kind: 'error', message: 'That link is missing its verification token.' },
  );
  const [email, setEmail] = useState('');
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, kind }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setState(
          res.ok
            ? { kind: 'done', emailChange: kind === 'email_change' }
            : { kind: 'error', message: data?.error?.message ?? 'We could not verify that link.' },
        );
      } catch {
        if (!cancelled) setState({ kind: 'error', message: 'We could not reach the server. Check your connection and try again.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, kind]);

  const resend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    setResendError('');
    // A failed request must not produce the sent sentence. The previous
    // version set `resent` in `finally`, so a 500 still claimed a link was
    // on its way — the one thing this screen must never say falsely.
    try {
      const res = await fetch('/api/v1/auth/verify-email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('resend failed');
      setResent(true);
    } catch {
      setResendError('We could not send that just now. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      footer={
        <Link href="/login" className="transition-colors hover:text-foreground">
          Back to sign in
        </Link>
      }
    >
      <Card className="p-6 text-center sm:p-7">
        {state.kind === 'verifying' ? (
          <>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary text-foreground">
              <Icon name="mail" size={22} />
            </span>
            <h1 className="t-title mt-4">Checking that link</h1>
            <p className="t-caption mt-2 text-muted-foreground" role="status">
              Verifying your email address… This takes a moment.
            </p>
          </>
        ) : state.kind === 'done' ? (
          <>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-good-soft text-good-strong">
              <Icon name="reviewed" size={22} />
            </span>
            <h1 className="t-title mt-4">{state.emailChange ? 'Email updated' : 'Email verified'}</h1>
            <p className="t-caption mt-2 text-muted-foreground">
              {state.emailChange
                ? 'Your sign-in email now points at the new address.'
                : 'Your account is active. Sign in and we will build today’s queue.'}
            </p>
            <Link
              href={state.emailChange ? '/settings' : '/login'}
              className={cn(buttonVariants({ variant: 'primary' }), 'mt-6 w-full')}
            >
              {state.emailChange ? 'Back to settings' : 'Sign in'}
            </Link>
          </>
        ) : (
          <>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive-ink">
              <Icon name="due" size={22} />
            </span>
            <h1 className="t-title mt-4">That link didn’t work</h1>
            <p className="t-caption mt-2 text-muted-foreground">{state.message}</p>

            {resent ? (
              <p className="t-caption mt-5 rounded-md bg-secondary px-3 py-2.5 text-foreground" role="status">
                If that address has an unverified account, a fresh link is on its way.
              </p>
            ) : (
              <form onSubmit={resend} className="mt-5 space-y-3 text-left">
                <div>
                  <Label htmlFor="resend-email">Send me a new link</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Icon name="mail" size={17} />
                    </span>
                    <Input
                      id="resend-email"
                      type="email"
                      required
                      className="pl-11"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@school.edu"
                      autoComplete="email"
                      spellCheck={false}
                      autoCapitalize="none"
                      aria-describedby={resendError ? 'resend-error' : undefined}
                      aria-invalid={resendError ? true : undefined}
                    />
                  </div>
                </div>
                {resendError && (
                  <p id="resend-error" className="t-fine text-destructive-ink" role="alert">
                    {resendError}
                  </p>
                )}
                <Button variant="secondary" type="submit" className="w-full gap-2" disabled={busy}>
                  <Icon name="rotate" size={16} />
                  {busy ? 'Sending…' : 'Re-send verification email'}
                </Button>
              </form>
            )}

            <Link href="/login" className={cn(buttonVariants({ variant: 'primary' }), 'mt-3 w-full')}>
              Back to sign in
            </Link>
          </>
        )}
      </Card>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <Card className="p-6 sm:p-7">
            <p className="t-caption text-muted-foreground" role="status">
              Verifying…
            </p>
          </Card>
        </AuthShell>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
