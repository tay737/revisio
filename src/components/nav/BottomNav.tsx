'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Icon } from '@/components/ui/icons';
import { SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { isActivePath, type NavItem } from '@/components/nav/routes';

/**
 * The mobile bar — the piece that was called out, rebuilt from the ground up.
 *
 * What was wrong with the floating pill it replaces: it hovered 12px off the
 * bottom edge over a gradient fade, so it read as a widget sitting *on* the app
 * rather than as the app's chrome, and it wasted the two most valuable strips
 * of a phone screen (the corners). A thumb aiming at a 56px pill that moves
 * relative to the page edge is a worse target than a full-bleed strip anchored
 * to the viewport.
 *
 * What it is now, per docs/DESIGN-UBER.md (`nav-bar`):
 *   • full-bleed and flush to the bottom, with the safe-area inset as padding,
 *     so it never fights the home indicator;
 *   • `glass-bar` — solid enough to read text on, translucent enough that the
 *     page is visibly passing underneath it;
 *   • a 1px top hairline instead of a shadow, and a 3px ink bar over the active
 *     slot that *travels* between slots on a spring;
 *   • five equal 64px slots — four destinations plus More — which is the first
 *     time every destination in the app has been reachable from a phone.
 *
 * Review carries the due count as a badge, in the one colour that means "there
 * is something here for you" (`.badge-good`), so the bar answers what to do as
 * well as where to go.
 */
export function BottomNav({
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
    <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      <nav aria-label="Primary" className="glass-bar border-t border-border pb-safe">
        <ul className="flex h-16 items-stretch px-1">
          {tabs.map((item) => {
            const active = isActivePath(pathname, item.href);
            const badge = item.href === '/review' && due > 0 ? due : 0;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex h-full flex-col items-center justify-center gap-1 transition-[color,transform] duration-150 active:scale-[0.94]',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="bottom-nav-active"
                      aria-hidden
                      className="absolute top-0 h-[3px] w-9 rounded-b-full bg-foreground"
                      transition={SPRING.layout}
                    />
                  )}
                  <span className="relative">
                    <Icon name={item.icon} size={22} strokeWidth={active ? 2.3 : 1.9} />
                    {badge > 0 && (
                      <span className="absolute -right-3 -top-1.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-good px-1 text-[10px] font-bold leading-none text-white">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'text-[11px] leading-none tracking-[0.01em]',
                      active ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}

          <li className="flex-1">
            <button
              type="button"
              onClick={onMore}
              aria-haspopup="dialog"
              aria-label="More destinations"
              className={cn(
                'relative flex h-full w-full flex-col items-center justify-center gap-1 transition-[color,transform] duration-150 active:scale-[0.94]',
                overflowActive ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {overflowActive && (
                <motion.span
                  layoutId="bottom-nav-active"
                  aria-hidden
                  className="absolute top-0 h-[3px] w-9 rounded-b-full bg-foreground"
                  transition={SPRING.layout}
                />
              )}
              <Icon name="more" size={22} strokeWidth={overflowActive ? 2.3 : 1.9} />
              <span
                className={cn(
                  'text-[11px] leading-none tracking-[0.01em]',
                  overflowActive ? 'font-semibold' : 'font-medium',
                )}
              >
                More
              </span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
