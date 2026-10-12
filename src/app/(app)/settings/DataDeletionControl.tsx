'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiClientError, setToken } from '@/lib/api';
import { signOut } from '@/lib/useMe';
import { useMe } from '@/lib/useMe';
import { Notice } from '@/components/Notice';

type DeletionPreview = {
  confirm: true;
  message: string;
  email: string | null;
  expiresAt: string;
  confirmationToken: string;
};

export function DataDeletionControl() {
  const router = useRouter();
  const { me } = useMe();
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [typedEmail, setTypedEmail] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!preview) return;
    const update = () => setRemaining(Math.max(0, Math.ceil((Date.parse(preview.expiresAt) - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [preview]);

  const requestPreview = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api.del<DeletionPreview>('/api/v1/data-deletion');
      if (!result.confirm || !result.expiresAt) throw new Error('We could not prepare the deletion confirmation.');
      setPreview(result);
      setTypedEmail('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not prepare the deletion confirmation.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDeletion = async () => {
    if (!preview || remaining <= 0 || !preview.email || typedEmail.trim().toLowerCase() !== preview.email.toLowerCase()) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.del<{ deleted: boolean; message: string }>(
        '/api/v1/data-deletion',
        { 'x-data-deletion-confirm': preview.confirmationToken },
      );
      if (!result.deleted) throw new Error('The server did not confirm account deletion.');
      setToken(null);
      await signOut();
      router.replace('/login?accountDeleted=1');
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === 'deletion_confirmation_expired') {
        setPreview(null);
        setTypedEmail('');
        setError('The confirmation expired. Request a new one before continuing.');
      } else {
        setError(cause instanceof Error ? cause.message : 'We could not delete this account.');
      }
    } finally {
      setBusy(false);
    }
  };

  const emailMatches = !!preview?.email && typedEmail.trim().toLowerCase() === preview.email.toLowerCase();

  return (
    <section className="card p-5" aria-labelledby="delete-account-heading">
      <h2 id="delete-account-heading" className="t-strong">Delete my data</h2>
      <p className="t-caption mt-1 text-muted-foreground">
        This anonymises your account and removes selected account records. It does not currently erase all historical learning or class records. You will not be able to sign in again, and the action cannot be undone.
      </p>
      {!preview ? (
        <button type="button" className="btn btn-danger mt-4" onClick={() => void requestPreview()} disabled={busy || !me}>
          {busy ? 'Preparing…' : 'Review account deletion'}
        </button>
      ) : (
        <div className="mt-4 space-y-3" aria-labelledby="delete-account-heading">
          <Notice tone="note" show>
            {preview.message} Confirm within {remaining} seconds. This confirmation is linked to your signed-in account and email; it does not verify guardian authority or ask for your password.
          </Notice>
          {remaining === 0 && <p className="t-caption text-destructive-ink" role="status">This confirmation window has expired. Request a new one to continue.</p>}
          <label htmlFor="delete-account-email" className="label">Type your account email to confirm</label>
          <input
            id="delete-account-email"
            type="email"
            className="input"
            autoComplete="email"
            value={typedEmail}
            onChange={(event) => setTypedEmail(event.target.value)}
            disabled={remaining === 0 || busy}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-danger" onClick={() => void confirmDeletion()} disabled={!emailMatches || remaining === 0 || busy}>
              {busy ? 'Deleting…' : 'Permanently delete account'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { setPreview(null); setTypedEmail(''); setError(''); }} disabled={busy}>
              Cancel
            </button>
            {remaining === 0 && <button type="button" className="btn btn-secondary" onClick={() => void requestPreview()} disabled={busy}>Request a new confirmation</button>}
          </div>
        </div>
      )}
      <Notice tone="bad" show={!!error} className="mt-3">{error}</Notice>
    </section>
  );
}
