'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Centre = { notifications: { id: string }[]; unread: number };

/**
 * The bell in the app bar (#11) — unread count at a glance, one tap to the
 * centre. It polls once a minute rather than subscribing: the centre is a
 * pull surface, and a websocket for a badge would be machinery the reminder
 * cadence does not need.
 */
export function NotificationBell() {
  const { data } = useSWR<Centre>('/api/v1/notifications', api.get, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const unread = data?.unread ?? 0;

  return (
    <Link
      href="/notifications"
      className={cn(badgeVariants({ variant: 'chip' }), 'num relative min-h-11 px-3')}
      title={unread > 0 ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'Notifications'}
      aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
    >
      <Icon name="bell" size={14} className={unread > 0 ? 'text-foreground' : 'text-muted-foreground'} />
      {unread > 0 && <span>{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}
