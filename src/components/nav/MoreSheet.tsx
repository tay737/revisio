'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { NumberTicker } from '@/components/ui/motion/number-ticker';
import { SPRING, scrimVariants, sheetVariants } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/profile';
import { rankFor } from '@/domain/ranked';
import { isActivePath, type NavItem } from '@/components/nav/routes';
import type { Me } from '@/lib/useMe';

/**
 * The overflow sheet.
 *
 * It exists to make the tab bar's four slots an editorial choice rather than a
 * hard limit. Everything the bar cannot hold is here, described — a bare list
 * of labels was what made the old navigation feel like a settings menu.
 *
 * The sheet owns everything that belongs to it: its scrim, its exit animation,
 * Escape, the scroll lock and the drag-to-dismiss, so the shell only tracks one
 * boolean. It floats above the tab bar rather than sitting flush, which keeps
 * the bar visible and makes the relationship between the two obvious.
 */
export function MoreSheet({
  open,
  onClose,
  items,
  pathname,
  me,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  pathname: string;
  me: Me;
  onSignOut: () => void;
}) {
  // Escape and the scroll lock live with the sheet, not in the shell: a sheet
  // that is open is the sheet's problem.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const rank = rankFor(me.gamification.totalXp);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <motion.button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            variants={scrimVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            className="absolute inset-0 h-full w-full cursor-default bg-[rgb(var(--c-scrim)/0.35)] backdrop-blur-[3px]"
          />

          <motion.div
            role="menu"
            variants={sheetVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.45 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 600) onClose();
            }}
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}
            className="glass-float absolute inset-x-3 max-h-[72vh] overflow-y-auto rounded-[28px] p-4"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-edge" />

            {/* Identity first: a menu that knows who you are is a companion's
                menu, not a settings page's. */}
            <div className="mb-4 flex items-center gap-3 px-1">
              <RankCrest rank={rank} size={42} showProgress={false} />
              <div className="min-w-0 flex-1">
                <div className="t-strong truncate">{me.name}</div>
                <div className="t-fine mt-0.5 text-muted">
                  {rank.label} · <NumberTicker value={rank.points} /> RP · {me.gamification.streak}d
                </div>
              </div>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/12 text-[13px] font-semibold text-accent">
                {initials(me.name)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {items.map((item, i) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING.settle, delay: 0.06 + i * 0.035 }}
                  >
                    <Link
                      href={item.href}
                      role="menuitem"
                      className={cn(
                        'flex h-full min-h-[86px] flex-col justify-between rounded-[18px] border p-3 transition-colors duration-200',
                        active ? 'border-accent/50 bg-accent/10' : 'border-edge/70 bg-panel/60',
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-8 w-8 place-items-center rounded-full',
                          active ? 'bg-accent/15 text-accent' : 'bg-edge/40 text-ink',
                        )}
                      >
                        <Icon name={item.icon} size={16} />
                      </span>
                      <span className="mt-2 block">
                        <span className={cn('block text-[14px] leading-[1.29] tracking-[-0.224px]', active ? 'font-semibold text-accent' : 'font-normal')}>
                          {item.label}
                        </span>
                        <span className="t-fine mt-0.5 block text-muted">{item.hint}</span>
                      </span>
                    </Link>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center gap-2 border-t border-edge/70 pt-3">
              <ThemeToggle className="h-11 w-11" />
              <button type="button" onClick={onSignOut} className="btn-ghost h-11 flex-1 gap-2">
                <Icon name="signOut" size={16} />
                Sign out
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
