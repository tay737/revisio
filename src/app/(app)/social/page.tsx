'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { api, ApiClientError } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import PageSkeleton from '@/components/PageSkeleton';
import { Notice } from '@/components/Notice';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useMe } from '@/lib/useMe';

type ConnectionUser = { id: string; name: string; username: string | null; avatarColor: string | null };
type Connection = {
  id: string;
  kind: 'buddy' | 'accountability';
  status: 'pending' | 'accepted';
  direction: 'outgoing' | 'incoming';
  createdAt: string;
  user: ConnectionUser;
};
type BoardEntry = { userId: string; name: string; username: string | null; weeklyXp: number; streak: number; kind: string; rank: number; isSelf?: boolean };
type SocialData = { consentSocial: boolean; connections: Connection[]; board: BoardEntry[] };

type GuardianLink = {
  id: string;
  role: 'student' | 'guardian';
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  user: ConnectionUser | null;
};
type GuardianSummary = {
  last30Days: { reviews: number; correct: number; accuracy: number | null } | null;
  streak: number | null;
  topicsMastered: number;
};

function PersonChip({ user }: { user: ConnectionUser | null }) {
  if (!user) return <span className="t-caption text-muted-foreground">Unknown account</span>;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary t-caption-s font-bold">
        {(user.name || '?').slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate t-caption font-semibold">{user.name}</span>
        {user.username && <span className="block truncate t-fine text-muted-foreground">@{user.username}</span>}
      </span>
    </span>
  );
}

/**
 * The study circle (#15): opt-in buddies and accountability partners, a
 * private friend board that is deliberately NOT the public leaderboard, and
 * guardian summary links. Everything here sits behind `consent.social` — the
 * API 409s without it, so the page explains the gate instead of failing.
 */
export default function SocialPage() {
  const { me } = useMe();
  const underAge = me?.isUnderAge === true;
  const { data, error: loadError, mutate, isLoading } = useSWR<SocialData>('/api/v1/social', api.get, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const { data: guardianData, error: guardianLoadError, mutate: mutateGuardian } = useSWR<{ links: GuardianLink[] }>(
    '/api/v1/social/guardian',
    api.get,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const [username, setUsername] = useState('');
  const [kind, setKind] = useState<'buddy' | 'accountability'>('buddy');
  const [guardianUsername, setGuardianUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [summaryFor, setSummaryFor] = useState<string | null>(null);
  const [summary, setSummary] = useState<GuardianSummary | null>(null);

  const consentOff = data ? !data.consentSocial : false;
  const connections = data?.connections ?? [];
  const incoming = connections.filter((c) => c.status === 'pending' && c.direction === 'incoming');
  const outgoing = connections.filter((c) => c.status === 'pending' && c.direction === 'outgoing');
  const accepted = connections.filter((c) => c.status === 'accepted');
  const board = data?.board ?? [];
  const links = guardianData?.links ?? [];

  // Writer-vetted consent strings (docs/COPY-SOCIAL-CONSENT-2026-11-16.md §2):
  // the actor's own switch is what 409/403-consent means — name the setting,
  // say what to do, never blame the counterparty.
  const CONSENT_GENERIC = 'Social is off on your account. Enable Social under How we use your data in Settings, save, then try again.';
  const CONSENT_GUARDIAN_ACCEPT = 'You need Social turned on to accept a summary link. Enable it under How we use your data in Settings, save, then accept again.';
  const CONSENT_SUMMARY_VIEW = 'You need Social turned on to view summaries. Enable it under How we use your data in Settings, save, then try again.';

  const fail = (e: unknown, consentCopy = CONSENT_GENERIC) => {
    // Consent gates come back as 409 on writes and 403 on the summary read —
    // both mean the same thing to the person clicking.
    if (e instanceof ApiClientError && (e.status === 409 || (e.status === 403 && /consent/i.test(e.message)))) {
      setError(consentCopy);
    } else {
      setError(e instanceof Error ? e.message : 'That did not go through.');
    }
    setNotice('');
  };

  const act = async (fn: () => Promise<unknown>, okMessage?: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      setNotice(okMessage ?? 'Done.');
      await mutate();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    act(async () => {
      await api.post('/api/v1/social', { action: 'send', username: username.trim().replace(/^@/, ''), kind });
      setUsername('');
    }, 'Request sent.');

  const respond = async (connectionId: string, response: string) => {
    await act(() => api.post('/api/v1/social', { action: 'respond', connectionId, response }), 'Updated.');
    setConfirming(null);
  };

  const guardianAct = async (fn: () => Promise<unknown>, okMessage?: string, consentCopy?: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      setNotice(okMessage ?? 'Done.');
      await mutateGuardian();
    } catch (e) {
      fail(e, consentCopy);
    } finally {
      setBusy(false);
    }
  };

  const addGuardian = () =>
    guardianAct(async () => {
      await api.post('/api/v1/social/guardian', { action: 'create', guardianUsername: guardianUsername.trim().replace(/^@/, '') });
      setGuardianUsername('');
    }, 'Summary link sent — they need to accept it.');

  const guardianRespond = (linkId: string, response: string) =>
    guardianAct(
      () => api.post('/api/v1/social/guardian', { action: 'respond', linkId, response }),
      'Updated.',
      response === 'accept' ? CONSENT_GUARDIAN_ACCEPT : undefined,
    );

  const viewSummary = async (studentId: string) => {
    if (!studentId) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.get<GuardianSummary>(`/api/v1/social/guardian/summary?studentId=${encodeURIComponent(studentId)}`);
      setSummary(result);
      setSummaryFor(studentId);
    } catch (e) {
      fail(e, CONSENT_SUMMARY_VIEW);
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <PageSkeleton />;

  // A failed fetch must not render as "consent on, nobody here" — that reads
  // as an empty circle, not an outage. Show the error card instead.
  if (loadError && data === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon="join"
          title="Study circle"
          subtitle="Buddies and accountability partners — private, never on the public leaderboard."
        />
        <Card className="p-6 text-center">
          <Icon name="due" size={20} className="mx-auto text-destructive-ink" />
          <p className="t-strong mt-2">We couldn’t load your study circle.</p>
          <p className="t-caption mt-1 text-muted-foreground">Check your connection and try again.</p>
          <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => void mutate()}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon="join"
        title="Study circle"
        subtitle="Buddies and accountability partners — private, never on the public leaderboard."
      />

      <Notice tone="bad" show={!!error}>{error}</Notice>
      <Notice tone="good" show={!!notice}>{notice}</Notice>

      {consentOff ? (
        /* Consent off: the API returns empty collections, which would read as
           "no friends yet" — a lie about the reason. Writer-vetted strings
           (docs/COPY-SOCIAL-CONSENT-2026-11-16.md §1); the severance line
           reflects backend's delete-on-withdraw, not keep-and-hide. */
        <Card className="p-5">
          <h2 className="t-strong">{underAge ? 'Social is not available on this account' : 'Social is off'}</h2>
          <p className="t-caption mt-2 text-muted-foreground">
            {underAge
              ? 'This account was registered with guardian consent, so study links, friend boards and guardian summaries stay off — only a parent or guardian can change that.'
              : 'Study circle — buddies, accountability partners and guardian summaries — sits behind the Social switch in Settings. Nothing here is shared while it is off.'}
          </p>
          {!underAge && (
            <>
              <p className="t-caption mt-2 text-muted-foreground">
                Turning Social on lets people you link see your name, username and avatar, and shows a private weekly board of XP and streak for your circle — never public, never the leaderboard. A guardian summary shares review counts, accuracy, streak and topics mastered over the last 30 days, only with someone you choose, and only while they accept.
              </p>
              <p className="t-caption mt-2 text-muted-foreground">
                Turning Social off ends your study links and summary shares.
              </p>
              <Link
                href="/settings#how-we-use-your-data"
                className="mt-3 inline-flex min-h-11 items-center t-caption font-semibold text-foreground underline underline-offset-4"
              >
                Open Settings
              </Link>
            </>
          )}
        </Card>
      ) : (
      <>
      {/* ── Add someone ─────────────────────────────────────────────────── */}
      <Card className="p-5">
        <h2 className="t-strong">Add someone</h2>
        <p className="t-caption mt-1 text-muted-foreground">Their username, exactly as it appears on their profile.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <Label htmlFor="social-username">Username</Label>
            <Input
              id="social-username"
              className="mt-1"
              placeholder="studybuddy"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
          <div>
            <Label htmlFor="social-kind">Kind</Label>
            <NativeSelect id="social-kind" className="mt-1" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="buddy">Study buddy</option>
              <option value="accountability">Accountability</option>
            </NativeSelect>
          </div>
          <Button type="button" variant="primary" disabled={busy || !username.trim() || consentOff} onClick={() => void send()}>
            Send request
          </Button>
        </div>
      </Card>

      {/* ── Requests ────────────────────────────────────────────────────── */}
      {(incoming.length > 0 || outgoing.length > 0) && (
        <Card className="p-5">
          <h2 className="t-strong">Requests</h2>
          <ul className="mt-3 divide-y divide-border/60">
            {incoming.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <PersonChip user={c.user} />
                <Badge variant="chip" className="num shrink-0">{c.kind === 'accountability' ? 'accountability' : 'buddy'}</Badge>
                <span className="ml-auto flex gap-2">
                  <Button type="button" size="sm" variant="good" disabled={busy || consentOff} onClick={() => void respond(c.id, 'accept')}>
                    Accept
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void respond(c.id, 'decline')}>
                    Decline
                  </Button>
                  {confirming === `${c.id}:block` ? (
                    <>
                      <Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => void respond(c.id, 'block')}>
                        Block
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                        Keep
                      </Button>
                    </>
                  ) : (
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(`${c.id}:block`)}>
                      Block
                    </Button>
                  )}
                </span>
                {confirming === `${c.id}:block` && (
                  <span className="basis-full t-fine text-muted-foreground">
                    Blocking is permanent — they won’t be able to find you again.
                  </span>
                )}
              </li>
            ))}
            {outgoing.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <PersonChip user={c.user} />
                <Badge variant="chip" className="num shrink-0">{c.kind === 'accountability' ? 'accountability' : 'buddy'}</Badge>
                <span className="t-fine text-muted-foreground">waiting for them</span>
                <Button type="button" size="sm" variant="ghost" className="ml-auto" disabled={busy} onClick={() => void respond(c.id, 'cancel')}>
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Your circle ─────────────────────────────────────────────────── */}
      <Card className="p-5">
        <h2 className="t-strong">Your circle</h2>
        {accepted.length === 0 ? (
          <p className="t-caption mt-2 text-muted-foreground">
            Nobody yet. Send a request above — they appear here once they accept.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {accepted.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <PersonChip user={c.user} />
                <Badge variant="chip" className="num shrink-0">{c.kind === 'accountability' ? 'accountability' : 'buddy'}</Badge>
                {confirming === `${c.id}:remove` ? (
                  <span className="ml-auto flex gap-1.5">
                    <Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => void respond(c.id, 'remove')}>
                      Remove
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    disabled={busy}
                    onClick={() => setConfirming(`${c.id}:remove`)}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Friend board — private, weekly ──────────────────────────────── */}
      {(board.length > 0 || accepted.length > 0) && (
        <Card className="p-5">
          <h2 className="t-strong">This week, privately</h2>
          <p className="t-caption mt-1 text-muted-foreground">
            Weekly XP and streaks for your circle only. It never touches the public leaderboard.
          </p>
          {board.length === 0 ? (
            <p className="t-caption mt-3 text-muted-foreground">
              Nobody in your circle is sharing weekly stats right now — they may have boards turned off in Settings.
            </p>
          ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {board.map((b) => (
              <li key={b.userId} className="flex items-center gap-3 py-2">
                <span className="num w-6 shrink-0 text-right t-caption-s font-bold text-muted-foreground">{b.rank}</span>
                <span className="min-w-0 flex-1 truncate t-caption font-medium">
                  {b.name}
                  {b.isSelf && <span className="ml-1.5 t-fine font-normal text-muted-foreground">(you)</span>}
                </span>
                <span className="num shrink-0 t-fine text-muted-foreground">{b.weeklyXp} XP this week</span>
                <span className="num flex shrink-0 items-center gap-1 t-fine text-muted-foreground">
                  <Icon name="streak" size={12} />
                  {b.streak}
                </span>
              </li>
            ))}
          </ul>
          )}
        </Card>
      )}

      {/* ── Guardian summary ────────────────────────────────────────────── */}
      <Card className="p-5">
        <h2 className="t-strong">Guardian summary</h2>
        <p className="t-caption mt-1 text-muted-foreground">
          Share a read-only progress summary with a parent or guardian. They see reviews, accuracy, streak and topics mastered — nothing else, and only while the link is accepted.
        </p>

        {guardianLoadError && guardianData === undefined && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="t-caption text-muted-foreground">We couldn’t load your summary links.</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => void mutateGuardian()}>
              Try again
            </Button>
          </div>
        )}

        {links.filter((l) => l.status === 'pending' && l.role === 'guardian').length > 0 && (
          <ul className="mt-3 divide-y divide-border/60">
            {links
              .filter((l) => l.status === 'pending' && l.role === 'guardian')
              .map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <PersonChip user={l.user} />
                  <span className="t-fine text-muted-foreground">wants to see your summary</span>
                  <span className="ml-auto flex gap-2">
                    <Button type="button" size="sm" variant="good" disabled={busy} onClick={() => void guardianRespond(l.id, 'accept')}>
                      Accept
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void guardianRespond(l.id, 'decline')}>
                      Decline
                    </Button>
                  </span>
                </li>
              ))}
          </ul>
        )}

        {links.filter((l) => l.role === 'student').length > 0 && (
          <ul className="mt-3 divide-y divide-border/60">
            {links
              .filter((l) => l.role === 'student')
              .map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <PersonChip user={l.user} />
                  <Badge variant="chip" className={cn('num shrink-0', l.status !== 'accepted' && 'opacity-60')}>
                    {l.status === 'accepted' ? 'sharing' : l.status === 'pending' ? 'waiting' : l.status}
                  </Badge>
                  {l.status === 'accepted' && (
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void guardianRespond(l.id, 'revoke')}>
                      Stop sharing
                    </Button>
                  )}
                </li>
              ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border/60 pt-4">
          <div className="min-w-0 flex-1">
            <Label htmlFor="social-guardian">Their username</Label>
            <Input
              id="social-guardian"
              className="mt-1"
              placeholder="parent_or_guardian"
              value={guardianUsername}
              onChange={(e) => setGuardianUsername(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <p className="t-caption mt-1.5 text-muted-foreground">
              They will need Social turned on in their own Settings before they can accept the link.
            </p>
          </div>
          <Button type="button" variant="secondary" disabled={busy || !guardianUsername.trim()} onClick={() => void addGuardian()}>
            Share summary
          </Button>
        </div>

        {/* Guardian side: accepted links let them open the summary. */}
        {links.some((l) => l.role === 'guardian' && l.status === 'accepted') && (
          <div className="mt-4 border-t border-border/60 pt-4">
            <p className="t-caption font-semibold">Summaries you can see</p>
            <ul className="mt-2 space-y-2">
              {links
                .filter((l) => l.role === 'guardian' && l.status === 'accepted')
                .map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-3">
                    <PersonChip user={l.user} />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy || !l.user?.id}
                      onClick={() => void viewSummary(l.user?.id ?? '')}
                    >
                      {summaryFor === l.user?.id ? 'Refresh' : 'View summary'}
                    </Button>
                  </li>
                ))}
            </ul>
            {summary && summaryFor && (
              <div className="inset mt-3 px-3 py-2.5">
                <p className="t-caption font-semibold">Last 30 days</p>
                {summary.last30Days ? (
                  <p className="t-caption mt-1 text-muted-foreground">
                    {summary.last30Days.reviews} reviews
                    {summary.last30Days.accuracy !== null && ` · ${summary.last30Days.accuracy}% accurate`}
                  </p>
                ) : (
                  <p className="t-caption mt-1 text-muted-foreground">Review counts are not shared.</p>
                )}
                {summary.streak !== null && (
                  <p className="t-caption mt-0.5 text-muted-foreground">Current streak: {summary.streak} days</p>
                )}
                <p className="t-caption mt-0.5 text-muted-foreground">Topics mastered: {summary.topicsMastered}</p>
              </div>
            )}
          </div>
        )}
      </Card>
      </>
      )}
    </div>
  );
}
