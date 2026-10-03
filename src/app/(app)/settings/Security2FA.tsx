'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/Notice';

type StartResponse = { secret: string; uri: string; qrDataUrl: string };
type ConfirmResponse = { enabled: boolean; recoveryCodes: string[] };

/**
 * Two-factor — enrol, save recovery codes, disable.
 *
 * The API has supported this from the start (GET/POST/DELETE on
 * /api/v1/auth/2fa); what was missing was any UI, so the Settings chip linked
 * to itself and nobody could switch 2FA on at all. The flow here is the
 * canonical one: scan → confirm with a live code → *copy the recovery codes
 * now*, because they are shown exactly once.
 *
 * Everything confirms in its own section with an inline Notice — no toast, no
 * browser dialog (docs/UI-SYSTEM: inline Notice is the app's one voice).
 */
export function Security2FA({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
  const [stage, setStage] = useState<'idle' | 'enrolling' | 'disabling'>('idle');
  const [start, setStart] = useState<StartResponse | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const beginEnrolment = async () => {
    setBusy(true);
    setError('');
    try {
      setStart(await api.get<StartResponse>('/api/v1/auth/2fa'));
      setCode('');
      setStage('enrolling');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not start the setup.');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnrolment = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await api.post<ConfirmResponse>('/api/v1/auth/2fa', { code: code.trim() });
      setRecoveryCodes(data.recoveryCodes);
      setStage('idle');
      setStart(null);
      setCode('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code was not accepted.');
    } finally {
      setBusy(false);
    }
  };

  /** Disable needs the code in the body, which `api.del` doesn't carry. */
  const disableWithCode = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/v1/auth/2fa', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) throw new Error(data.error?.message ?? 'That code was not accepted.');
      setStage('idle');
      setCode('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not turn 2FA off.');
    } finally {
      setBusy(false);
    }
  };

  const copyAll = async () => {
    if (!recoveryCodes) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setCopied(true);
    } catch {
      setError('Copy was blocked — select the codes and copy them by hand.');
    }
  };

  const copySecret = async () => {
    if (!start) return;
    try {
      await navigator.clipboard.writeText(start.secret);
      setCopied(true);
    } catch {
      setError('Copy was blocked — select the code and copy it by hand.');
    }
  };

  return (
    <section id="two-factor" className="scroll-mt-20" aria-labelledby="twofa-heading" tabIndex={-1}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="twofa-heading" className="t-strong">Two-factor authentication</h2>
          <p className="t-caption mt-1 text-muted-foreground">
            {enabled
              ? 'On. A code from your authenticator app is asked for at sign-in.'
              : 'Off. Add a second step to sign-in: a six-digit code from an authenticator app.'}
          </p>
        </div>
        <span className={`chip shrink-0 ${enabled ? 'badge-good' : ''} ${enabled ? '' : 'badge-quiet'}`}>
          <Icon name="secure" size={14} />
          {enabled ? '2FA on' : '2FA off'}
        </span>
      </div>

      <Notice tone="bad" show={!!error}>{error}</Notice>

      {/* ── Recovery codes shown once ────────────────────────────────────── */}
      {recoveryCodes && (
        <div className="card-soft mt-4">
          <p className="t-strong">Save your recovery codes now</p>
          <p className="t-caption mt-1 text-muted-foreground">
            Each works once, in place of an authenticator code, if you ever lose the app. These are
            shown only this once.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {recoveryCodes.map((c) => (
              <code key={c} className="rounded-md bg-card px-2 py-1.5 text-center font-mono text-[13px] font-semibold tracking-[0.08em]">
                {c}
              </code>
            ))}
          </div>
          <button type="button" className="btn btn-secondary btn-sm mt-3 gap-1.5" onClick={copyAll}>
            <Icon name={copied ? 'correct' : 'notes'} size={14} />
            {copied ? 'Copied' : 'Copy all'}
          </button>
        </div>
      )}

      {/* ── Off: begin enrolment ─────────────────────────────────────────── */}
      {!enabled && stage === 'idle' && (
        <button type="button" className="btn btn-primary mt-4 gap-2" onClick={beginEnrolment} disabled={busy}>
          <Icon name="secure" size={15} />
          {busy ? 'Starting…' : 'Start setup'}
        </button>
      )}

      {/* ── Enrolling: scan, confirm ─────────────────────────────────────── */}
      {stage === 'enrolling' && start && (
        <div className="mt-4 space-y-4">
          <ol className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-[13px] font-bold">1</span>
              <div>
                <p className="t-caption-s">Scan this with your authenticator app</p>
                <p className="t-fine mt-0.5 text-muted-foreground">Google Authenticator, 1Password, Authy — any TOTP app works.</p>
                <div className="mt-2 inline-block rounded-md bg-white p-2">
                  {/* A data URL QR — plain <img>, next/image is for remote optimisation. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={start.qrDataUrl} alt="QR code to add Revisio to your authenticator app" width={160} height={160} />
                </div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-[13px] font-bold">2</span>
              <div className="min-w-0">
                <p className="t-caption-s">Or enter the code by hand</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <code className="rounded-md bg-secondary px-2.5 py-1.5 font-mono text-[13px] font-semibold tracking-[0.06em]">{start.secret}</code>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={copySecret}>
                    <Icon name="notes" size={14} />
                    Copy
                  </button>
                </div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-[13px] font-bold">3</span>
              <div>
                <p className="t-caption-s">Type the six-digit code the app shows</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <input
                    className="input max-w-[180px] tracking-[0.4em]"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    aria-label="Six-digit authenticator code"
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={code.length !== 6 || busy}
                    onClick={confirmEnrolment}
                  >
                    {busy ? 'Checking…' : 'Confirm and turn on'}
                  </button>
                </div>
              </div>
            </li>
          </ol>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStage('idle')}>
            Cancel
          </button>
        </div>
      )}

      {/* ── On: disable path ─────────────────────────────────────────────── */}
      {enabled && stage === 'idle' && (
        <button
          type="button"
          className="btn btn-danger mt-4 gap-1.5"
          onClick={() => {
            setStage('disabling');
            setCode('');
          }}
        >
          <Icon name="private" size={14} />
          Turn off
        </button>
      )}

      {stage === 'disabling' && (
        <div className="mt-4 space-y-2">
          <p className="t-caption text-muted-foreground">
            Turning 2FA off removes the second step from sign-in. Type a code from your
            authenticator app to prove it&apos;s you.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input max-w-[180px] tracking-[0.4em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              aria-label="Six-digit authenticator code"
            />
            <button type="button" className="btn btn-danger" disabled={code.length !== 6 || busy} onClick={disableWithCode}>
              {busy ? 'Working…' : 'Turn off 2FA'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStage('idle')}>
              Keep it on
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
