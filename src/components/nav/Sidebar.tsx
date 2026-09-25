'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Icon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { NumberTicker } from '@/components/ui/number-ticker';
import { SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/profile';
import { rankFor } from '@/domain/ranked';
import { isActivePath, type NavItem } from '@/components/nav/routes';
import type { Me } from '@/lib/useMe';

/**
 * Desktop navigation.
 *
 * It follows Uber's `ex-app-shell-row`: a canvas-coloured rail, no tint and no
 * shadow, with the active destination marked by a **left-edge indicator bar**
 * rather than by a filled pill — the same signal the mobile bar carries along
 * its top edge, so the app's idea of "you are here" is one idea in two places.
 *
 * The rank block at the foot is the one place on desktop that says what the
 * numbers add up to. Its meter is green because a rank climbing is the learner
 * *earning* something; chrome stays monochrome.
 */
export function Sidebar({
  nav,
  pathname,
  me,
  onSignOut,
}: {
  nav: NavItem[];
  pathname: string;
  me: Me;
  onSignOut: () => void;
}) {
  const rank = rankFor(me.gamification.totalXp);

  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-border bg-background px-3 py-4 md:flex">
      <Link href="/dashboard" className="mb-6 flex items-center gap-2.5 px-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-[13px] font-bold text-background">
          R
        </span>
        <span className="t-tagline">Revisio</span>
      </Link>

      <nav aria-label="Primary" className="flex-1 space-y-0.5">
        {nav.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.hint}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-11 items-center gap-3 rounded-md px-3 text-[15px] transition-colors duration-150',
                active ? 'font-semibold text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              {active && (
                <>
                  <span className="absolute inset-0 rounded-md bg-secondary" aria-hidden />
                  <motion.span
                    layoutId="sidebar-active"
                    aria-hidden
                    className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-foreground"
                    transition={SPRING.layout}
                  />
                </>
              )}
              <Icon name={item.icon} size={19} strokeWidth={active ? 2.2 : 1.9} className="relative" />
              <span className="relative">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <Link href="/progress" className="card mt-4 block p-3.5 transition-colors duration-150 hover:border-border-strong">
        <div className="flex items-center gap-3">
          <RankCrest rank={rank} size={44} />
          <div className="min-w-0">
            <div className="t-strong truncate">{rank.label}</div>
            <div className="text-[12px] text-muted-foreground">
              {rank.isApex ? 'Highest rank' : `${rank.remaining} RP to next`}
            </div>
          </div>
        </div>
        <div className="meter mt-3">
          <motion.div
            className="meter-fill"
            initial={{ width: 0 }}
            animate={{ width: `${rank.percent}%` }}
            transition={SPRING.meter}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[12px] text-muted-foreground">
          <span>
            <NumberTicker value={rank.points} className="num" /> RP
          </span>
          <span className="flex items-center gap-1">
            {me.gamification.streak}d
            <Icon
              name="streak"
              size={12}
              className={me.gamification.streak > 0 ? 'text-streak' : undefined}
            />
          </span>
        </div>
      </Link>

      <div className="mt-3 flex items-center gap-2.5 border-t border-border pt-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-[13px] font-semibold">
          {initials(me.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{me.name}</div>
          <div className="text-[12px] capitalize text-muted-foreground">{me.role}</div>
        </div>
        <ThemeToggle className="h-9 w-9" />
        <button
          type="button"
          onClick={onSignOut}
          aria-label="Sign out"
          className="btn btn-ghost h-9 w-9 !min-h-9 !px-0"
        >
          <Icon name="signOut" size={16} />
        </button>
      </div>
    </aside>
  );
}
