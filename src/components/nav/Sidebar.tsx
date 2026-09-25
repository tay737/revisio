'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Icon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { NumberTicker } from '@/components/ui/motion/number-ticker';
import { SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/profile';
import { rankFor } from '@/domain/ranked';
import { isActivePath, type NavItem } from '@/components/nav/routes';
import type { Me } from '@/lib/useMe';

/**
 * Desktop navigation.
 *
 * Three things it owns, all of which used to be improvised inline in the shell:
 * the destination list (from `nav/routes`, the single owner), the learner's
 * rank block, and their identity row. The moving pill behind the active item is
 * a shared-layout element, so the highlight *travels* between destinations
 * instead of blinking — the cheapest way for chrome to feel alive.
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
    <aside className="sticky top-0 hidden h-screen w-[252px] shrink-0 flex-col border-r border-edge/70 bg-shell/60 px-3 py-5 backdrop-blur-xl md:flex">
      <Link
        href="/dashboard"
        className="mb-7 flex items-center gap-2.5 px-2 text-[17px] font-semibold tracking-[-0.374px]"
      >
        <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-accent text-[12px] font-semibold text-accent-ink">
          R
        </span>
        Revisio
      </Link>

      <nav className="flex-1 space-y-0.5" aria-label="Primary">
        {nav.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              title={item.hint}
              className={cn(
                'group relative flex h-11 items-center gap-3 rounded-full px-3 text-[14px] leading-[1.29] tracking-[-0.224px] transition-colors duration-200',
                active ? 'text-accent' : 'text-muted hover:text-ink',
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-full bg-accent/10"
                  transition={SPRING.layout}
                />
              )}
              <span className="relative grid w-5 place-items-center">
                <Icon name={item.icon} size={18} strokeWidth={active ? 2.25 : 1.75} />
              </span>
              <span className={cn('relative', active && 'font-semibold')}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ── Rank block ───────────────────────────────────────────────────
          Rank replaced the old "Level 7 / 240 XP" bar. A rank is a position in
          a ladder, so it is drawn as a crest with the next rung named — the
          number alone never told anyone whether they were doing well. */}
      <Link
        href="/progress"
        className="group mt-4 rounded-[18px] border border-edge/70 bg-panel/60 p-3.5 transition-colors duration-200 hover:border-accent/40"
      >
        <div className="flex items-center gap-3">
          <RankCrest rank={rank} size={46} />
          <div className="min-w-0">
            <div className="t-caption-s truncate">{rank.label}</div>
            <div className="t-fine mt-0.5 text-muted">
              {rank.isApex ? 'Highest rank' : `${rank.remaining} RP to next`}
            </div>
          </div>
        </div>
        <div className="meter meter-accent mt-3">
          <motion.div
            className="h-full rounded-full bg-accent"
            initial={{ width: 0 }}
            animate={{ width: `${rank.percent}%` }}
            transition={SPRING.meter}
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="t-fine text-muted">
            <NumberTicker value={rank.points} /> RP
          </span>
          <span className="t-fine flex items-center gap-1 text-muted">
            {me.gamification.streak}d streak
            <Icon name="streak" size={11} className="text-accent" />
          </span>
        </div>
      </Link>

      <div className="mt-3 space-y-2 border-t border-edge/70 pt-3">
        <div className="flex items-center gap-2.5 px-1">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/12 text-[14px] font-semibold text-accent">
            {initials(me.name)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold leading-[1.29] tracking-[-0.224px]">
              {me.name}
            </div>
            <div className="t-fine capitalize text-muted">{me.role}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button type="button" onClick={onSignOut} className="btn-ghost h-11 flex-1 gap-2" aria-label="Sign out">
            <Icon name="signOut" size={16} />
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
