'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { Icon, type IconName } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import PageSkeleton from '@/components/PageSkeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { when } from '@/components/insights/InsightsBody';
import { cn } from '@/lib/utils';

type CentreItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

type CentreCursor = { createdAt: string; id: string };
type Centre = { notifications: CentreItem[]; unread: number; nextCursor: CentreCursor | null };

/** Kind → glyph; anything the backend adds later falls back to the bell.
 *  The retention cron records `due_cards` / `season_ending`; other features
 *  write their own kinds through `recordNotification`. */
const KIND_ICON: Record<string, IconName> = {
  due_cards: 'due',
  dueCards: 'due',
  streak_risk: 'streak',
  streakRisk: 'streak',
  season_ending: 'league',
  seasonEnding: 'league',
  achievement: 'achievements',
  streak: 'streak',
  challenge: 'clash',
  challengeComplete: 'clash',
  goal: 'target',
  goalReached: 'target',
  social: 'person',
  recap: 'week',
  weekly_recap: 'week',
};

/**
 * The notification centre (#11): everything the app has told you, newest
 * first, with read state. Opening an item marks it read and follows its link;
 * "mark all read" clears the badge without touching the list.
 */
export function NotificationsClient() {
  const PAGE = 50;
  const { data, error, mutate } = useSWR<Centre>(`/api/v1/notifications?limit=${PAGE}`, api.get, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const [busy, setBusy] = useState(false);
  // Older pages accumulate client-side: SWR owns page one, `older` owns the
  // rest, and `olderCursor` chains past page one once the learner asks for more.
  const [older, setOlder] = useState<CentreItem[]>([]);
  const [olderCursor, setOlderCursor] = useState<CentreCursor | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);

  const markRead = async (ids?: string[]) => {
    setBusy(true);
    try {
      const next = await api.post<Centre>('/api/v1/notifications', { ...(ids ? { ids } : {}), limit: PAGE });
      await mutate(next, { revalidate: false });
      // Pages past the first are not in the SWR cache — mirror the read state
      // locally so an opened older item stops looking unread.
      const now = new Date().toISOString();
      setOlder((prev) =>
        ids
          ? prev.map((n) => (ids.includes(n.id) && !n.readAt ? { ...n, readAt: now } : n))
          : prev.map((n) => (n.readAt ? n : { ...n, readAt: now })),
      );
    } catch {
      await mutate();
    } finally {
      setBusy(false);
    }
  };

  const items = data?.notifications ?? [];
  const allItems = [...items, ...older];
  const cursor = exhausted ? null : (olderCursor ?? data?.nextCursor ?? null);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const res = await api.get<Centre>(
        `/api/v1/notifications?limit=${PAGE}&before=${encodeURIComponent(cursor.createdAt)}&beforeId=${encodeURIComponent(cursor.id)}`,
      );
      setOlder((prev) => {
        const seen = new Set([...items.map((n) => n.id), ...prev.map((n) => n.id)]);
        return [...prev, ...res.notifications.filter((n) => !seen.has(n.id))];
      });
      setOlderCursor(res.nextCursor);
      if (!res.nextCursor) setExhausted(true);
    } catch {
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon="bell"
        title="Notifications"
        subtitle="Reminders and updates from your reviews."
        actions={
          data && data.unread > 0 ? (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void markRead()}>
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {data === undefined ? (
        error ? (
          <Card className="p-6 text-center">
            <Icon name="due" size={20} className="mx-auto text-destructive-ink" />
            <p className="t-strong mt-2">We couldn’t load your notifications.</p>
            <p className="t-caption mt-1 text-muted-foreground">Check your connection and try again.</p>
            <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => void mutate()}>
              Try again
            </Button>
          </Card>
        ) : (
          <PageSkeleton variant="list" />
        )
      ) : items.length === 0 ? (
        <Card className="p-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary text-muted-foreground">
            <Icon name="bell" size={20} />
          </span>
          <p className="t-caption mt-3 font-semibold">Nothing yet</p>
          <p className="t-caption mt-1 text-muted-foreground">
            Reminders you switch on in Settings land here, alongside updates about your reviews.
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-border/60 p-0">
          <ul>
            {allItems.map((n) => {
              const unread = !n.readAt;
              const inner = (
                <>
                  <span
                    className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-full',
                      unread ? 'bg-secondary text-foreground' : 'bg-secondary/50 text-muted-foreground',
                    )}
                  >
                    <Icon name={KIND_ICON[n.kind] ?? 'bell'} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate t-caption', unread ? 'font-semibold' : 'text-muted-foreground')}>
                      {unread && <span className="sr-only">Unread — </span>}
                      {n.title}
                    </span>
                    {n.body && <span className="mt-0.5 block t-fine text-muted-foreground">{n.body}</span>}
                    <span className="mt-1 block t-fine text-muted-foreground">{when(n.createdAt)}</span>
                  </span>
                  {unread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-good" aria-hidden="true" />}
                </>
              );
              const cls = 'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-secondary/40';
              return (
                <li key={n.id}>
                  {n.href ? (
                    <Link
                      href={n.href}
                      className={cls}
                      onClick={() => {
                        if (unread) void markRead([n.id]);
                      }}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={cn(cls, 'w-full text-left')}
                      onClick={() => {
                        if (unread) void markRead([n.id]);
                      }}
                    >
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {data !== undefined && items.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          {cursor && (
            <Button type="button" variant="secondary" size="sm" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? 'Loading…' : 'Load older notifications'}
            </Button>
          )}
          {moreError && (
            <p className="t-fine text-muted-foreground" role="status">
              We couldn’t load older notifications.{' '}
              <button type="button" className="font-semibold underline underline-offset-2" onClick={() => void loadMore()}>
                Try again
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
