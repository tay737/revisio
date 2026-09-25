'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Icon } from '@/components/ui/icons';
import { SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { isActivePath, type NavItem } from '@/components/nav/routes';

/**
 * The mobile tab bar.
 *
 * The previous implementation was a flush, full-width strip of five cramped
 * 52px cells with a 2px line on top as the active state, and it truncated
 * anything past the fifth destination — which silently put Progress and My
 * content out of reach on a phone. Four things are different here:
 *
 *   1. **It floats.** A detached pill inset from the edges reads as chrome over
 *      the page rather than as part of it, which is what the spec's frosted
 *      sticky bar is for. It also means the bar never fights the browser's own
 *      bottom gesture area.
 *   2. **The active state travels.** A single shared-layout pill slides between
 *      slots, so the bar has one moving part instead of five blinking ones.
 *   3. **The label is always visible.** No icon-only guessing.
 *   4. **Nothing is unreachable.** An overflow destination lights the More slot
 *      and opens the sheet — see `MoreSheet`.
 *
 * It also carries real information: the due count sits on Review as a badge, so
 * the bar tells you what to do rather than only where to go.
 */
export function MobileTabBar({
  tabs,
  pathname,
  due,
  overflowActive,
  onMore,
}: {
  tabs: NavItem[];
  pathname: string;
  due: number;
  overflowActive: boolean;
  onMore: () => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 md:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
    >
      {/* The page fades into the bar rather than colliding with it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg via-bg/85 to-transparent"
      />

      <nav
        aria-label="Primary"
        className="glass-float pointer-events-auto relative mx-3 flex items-stretch gap-0.5 rounded-full p-1.5"
      >
        {tabs.map((item) => {
          const active = isActivePath(pathname, item.href);
          const badge = item.href === '/review' && due > 0 ? due : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full transition-colors duration-200',
                active ? 'text-accent' : 'text-muted',
              )}
            >
              {active && (
                <motion.span
                  layoutId="mobile-tab-active"
                  className="absolute inset-0 rounded-full bg-accent/12"
                  transition={SPRING.layout}
                />
              )}
              <span className="relative">
                <Icon name={item.icon} size={20} strokeWidth={active ? 2.25 : 1.75} />
                {badge > 0 && (
                  <motion.span
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={SPRING.pop}
                    className="absolute -right-2.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-ink"
                  >
                    {badge > 99 ? '99+' : badge}
                  </motion.span>
                )}
              </span>
              <span className={cn('relative text-[10px] leading-none tracking-[-0.08px]', active && 'font-semibold')}>
                {item.label}
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={onMore}
          aria-haspopup="menu"
          aria-label="More destinations"
          className={cn(
            'relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full transition-colors duration-200',
            overflowActive ? 'text-accent' : 'text-muted',
          )}
        >
          {overflowActive && (
            <motion.span
              layoutId="mobile-tab-active"
              className="absolute inset-0 rounded-full bg-accent/12"
              transition={SPRING.layout}
            />
          )}
          <Icon name="more" size={20} strokeWidth={overflowActive ? 2.25 : 1.75} className="relative" />
          <span className={cn('relative text-[10px] leading-none tracking-[-0.08px]', overflowActive && 'font-semibold')}>
            More
          </span>
        </button>
      </nav>
    </div>
  );
}
