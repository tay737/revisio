'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Icon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { DUR, EASE } from '@/lib/motion';
import { labelForPath } from '@/components/nav/routes';
import { rankFor } from '@/domain/ranked';
import type { Me } from '@/lib/useMe';

/**
 * The app bar.
 *
 * The previous version put a full sentence in it on every screen — the greeting
 * plus the companion's line — which on a 390px phone truncated into ellipsis
 * and, on every screen, spent the most valuable strip of the layout on prose
 * the learner had not asked for. Under "not text everywhere", the bar now
 * carries **one word of navigation state and three numbers** on mobile:
 *
 *   [ crest ] Today                       3🔥   12
 *
 * The crest is your own rank, and it is the button that opens everything else —
 * so the companion, who lives in that sheet, is still one tap away from every
 * screen without saying anything in the bar. On desktop, where there is width to
 * spare and no thumb to reach with, the greeting and the companion's line stay:
 * that is the one place they were ever comfortable.
 */
export function TopBar({
  pathname,
  me,
  greeting,
  companionLine,
  onOpenAccount,
}: {
  pathname: string;
  me: Me;
  greeting: string;
  companionLine: string;
  onOpenAccount: () => void;
}) {
  const rank = rankFor(me.gamification.totalXp);
  const title = labelForPath(pathname);
  const streak = me.gamification.streak;
  const due = me.today.due;

  return (
    <header className="glass-bar sticky top-0 z-30 border-b border-border">
      {/* ── Phone ─────────────────────────────────────────────────────────── */}
      <div className="flex h-14 items-center gap-2.5 px-4 md:hidden">
        <button
          type="button"
          onClick={onOpenAccount}
          aria-label="Your account and menu"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-card transition-transform duration-150 active:scale-95"
        >
          <RankCrest rank={rank} size={22} showProgress={false} animate={false} />
        </button>

        <span className="t-strong truncate">{title}</span>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="chip num" title={`${streak}-day streak`}>
            <Icon
              name="streak"
              size={14}
              className={streak > 0 ? 'text-streak' : 'text-muted-foreground'}
            />
            {streak}
          </span>
          <Link
            href="/review"
            className="chip num"
            title={`${due} cards due today`}
            aria-label={`${due} cards due today`}
          >
            <Icon
              name="review"
              size={14}
              className={due > 0 ? 'text-good' : 'text-muted-foreground'}
            />
            {due}
          </Link>
        </div>
      </div>

      {/* ── Desktop ───────────────────────────────────────────────────────── */}
      <div className="hidden h-16 items-center gap-4 px-8 md:flex">
        <p className="min-w-0 flex-1 truncate text-[15px] leading-relaxed">
          <span className="font-semibold">{greeting}</span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span className="text-muted-foreground">{companionLine}</span>
        </p>

        <div className="flex shrink-0 items-center gap-1.5">
          <Link href="/review" className="chip num" title={`${due} cards due today`}>
            <Icon
              name="review"
              size={14}
              className={due > 0 ? 'text-good' : 'text-muted-foreground'}
            />
            {due}
            <span className="text-muted-foreground">due</span>
          </Link>
          <span className="chip num" title={`${streak}-day streak`}>
            <Icon
              name="streak"
              size={14}
              className={streak > 0 ? 'text-streak' : 'text-muted-foreground'}
            />
            {streak}
            <span className="text-muted-foreground">day streak</span>
          </span>
          <ThemeToggle className="h-9 w-9" />
        </div>
      </div>

      {/* A 2px ink hairline restarts on every navigation: continuity without a
          curtain over the page you are trying to read. */}
      <motion.div
        key={pathname}
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-foreground"
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
