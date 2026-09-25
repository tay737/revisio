'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Icon } from '@/components/ui/icons';
import { NumberTicker } from '@/components/ui/motion/number-ticker';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { DUR, EASE } from '@/lib/motion';
import type { Me } from '@/lib/useMe';

/**
 * The session header.
 *
 * It is where the companion is *always* present: the greeting and the
 * companion's line for the current state, on every page, so the app addresses
 * one person rather than presenting a generic dashboard. The live chips on the
 * right are the three numbers that decide what to do next (due, streak, rank
 * points), and the hairline under the bar re-runs on every navigation to mark
 * the transition — continuity that replaces the full-screen splash the app used
 * to throw over each route change.
 */
export function SessionHeader({
  pathname,
  me,
  greeting,
  companionLine,
  rankPoints,
}: {
  pathname: string;
  me: Me;
  greeting: string;
  companionLine: string;
  rankPoints: number;
}) {
  return (
    <header className="glass-bar sticky top-0 z-20 border-b border-edge/70">
      <div className="flex h-[52px] items-center gap-3 px-4 md:px-6">
        <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
          <span className="grid h-6 w-6 place-items-center rounded-[6px] bg-accent text-[11px] font-semibold text-accent-ink">
            R
          </span>
        </Link>

        {/* The companion, in one line. On phones the chips below already carry
            the numbers, so the sentence gets the space they would have taken. */}
        <p className="min-w-0 flex-1 truncate">
          <span className="t-caption-s">{greeting}</span>
          <span className="t-caption mx-2 text-muted">·</span>
          <span className="t-caption text-muted">{companionLine}</span>
        </p>

        <div className="flex shrink-0 items-center gap-1.5">
          <Link href="/review" className="chip" title={`${me.today.due} cards due today`}>
            <Icon name="due" size={14} className={me.today.due > 0 ? 'text-accent' : 'text-muted'} />
            <span className="tabular-nums">{me.today.due}</span>
            <span className="hidden sm:inline">due</span>
          </Link>
          <span className="chip" title={`${me.gamification.streak}-day streak`}>
            <Icon name="streak" size={14} className={me.gamification.streak > 0 ? 'text-accent' : 'text-muted'} />
            <span className="tabular-nums">{me.gamification.streak}</span>
            <span className="hidden sm:inline">day{me.gamification.streak === 1 ? '' : 's'}</span>
          </span>
          <Link href="/progress" className="chip hidden lg:inline-flex" title="Rank points">
            <Icon name="rank" size={14} className="text-accent" />
            <NumberTicker value={rankPoints} className="tabular-nums" />
            <span>RP</span>
          </Link>
          <span className="md:hidden">
            <ThemeToggle className="h-9 w-9" />
          </span>
        </div>
      </div>

      {/* Route progress: a hairline that restarts on every navigation. Two
          pixels of movement reads as "the app is doing something" without
          putting a curtain over the page you are trying to read. */}
      <motion.div
        key={pathname}
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-accent/70"
        initial={{ scaleX: 0, opacity: 1 }}
        animate={{ scaleX: 1, opacity: 0 }}
        transition={{
          scaleX: { duration: DUR.slow, ease: EASE.out },
          opacity: { duration: DUR.quick, ease: EASE.out, delay: DUR.slow },
        }}
      />
    </header>
  );
}
