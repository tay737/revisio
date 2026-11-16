'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { DashboardCardSkeleton } from '@/components/dashboard/DashboardCardSkeleton';
import { Icon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/useMe';

type Referral = {
  code: string;
  shareUrl: string;
  invited: number;
};

/**
 * Peer referral surface (#20) — the learner's shareable code and link, with
 * an invite count and a rotate escape hatch for a leaked code.
 *
 * Self-contained fetch like the other dashboard cards: the GET lazily creates
 * the code server-side, an error renders nothing rather than a broken card,
 * and the whole card is student-only. Rotation confirms inline (the old code
 * stops attributing new sign-ups; counted invites are kept server-side).
 */
export function ReferralCard() {
  const { me } = useMe();
  const [referral, setReferral] = useState<Referral | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ referral: Referral }>('/api/v1/referrals/me')
      .then((d) => setReferral(d.referral))
      .catch(() => setReferral(null))
      .finally(() => setLoaded(true));
  }, []);

  if (me?.role !== 'student') return null;
  if (!loaded) return <DashboardCardSkeleton />;
  if (!referral) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referral.shareUrl);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be denied (permissions, non-secure context). Say so —
      // a silent tap looks dead — and point at the selectable URL below.
      setCopyFailed(true);
    }
  };

  const rotate = async () => {
    setBusy(true);
    setError('');
    try {
      const d = await api.post<{ referral: Referral }>('/api/v1/referrals/me');
      setReferral(d.referral);
      setConfirmRotate(false);
      setCopied(false);
    } catch {
      setError('Could not rotate the code. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="t-strong">Invite a friend</h2>
        <span className="t-fine text-muted-foreground">
          {referral.invited === 1 ? '1 invite' : `${referral.invited} invites`}
        </span>
      </div>

      <p className="t-caption mt-2 text-muted-foreground">
        Share your link. Anyone who signs up through it counts as your invite.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <code className="num min-w-0 flex-1 truncate rounded-md border border-border bg-secondary px-3 py-2 t-body tracking-[0.15em]">
          {referral.code}
        </code>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => void copyLink()}
          aria-live="polite"
        >
          <Icon name={copied ? 'correct' : 'visible'} size={14} />
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      <p className="t-fine mt-1.5 truncate text-muted-foreground">{referral.shareUrl}</p>
      {copyFailed && (
        <p className="t-fine mt-1.5 text-muted-foreground">
          Copy didn&apos;t work. Select the link above and copy it by hand.
        </p>
      )}

      {confirmRotate ? (
        <div className="mt-3 rounded-md border border-border bg-secondary/50 px-3 py-2.5">
          <p className="t-caption-s">Rotate the code?</p>
          <p className="t-caption mt-0.5 text-muted-foreground">
            The current code stops working. Links you have already shared will not count new sign-ups. Invites already counted stay.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void rotate()}>
              {busy ? 'Rotating…' : 'Rotate code'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRotate(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-11 px-2 t-fine text-muted-foreground"
          onClick={() => setConfirmRotate(true)}
        >
          Rotate the code
        </Button>
      )}
      {error && <p className="t-caption mt-2 text-destructive-ink">{error}</p>}
    </Card>
  );
}
