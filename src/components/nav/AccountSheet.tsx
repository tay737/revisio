'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/profile';
import { rankFor } from '@/domain/ranked';
import { isActivePath, type NavItem } from '@/components/nav/routes';
import type { Me } from '@/lib/useMe';

/**
 * Everything the bar cannot hold, plus who you are.
 *
 * It is a bottom sheet on the shadcn `Sheet` primitive (Base UI underneath,
 * which is what brings focus trapping, Escape, the scroll lock and the
 * swipe-to-dismiss transitions as behaviour rather than as code I wrote twice).
 * The previous version was a hand-rolled overlay with a two-column grid of
 * 86px-tall cards, each carrying a label *and* a sentence: twelve words to say
 * "Cram" and "Exam". Destination rows are now one line each — icon, name, a
 * four-word hint, chevron — which fits every destination on screen at once
 * without scrolling.
 *
 * The companion speaks here. `line` is optional so the sheet can also be opened
 * from the staff portals, where there is nothing to nudge about.
 */
export function AccountSheet({
  open,
  onClose,
  items,
  pathname,
  me,
  line,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  pathname: string;
  me: Me;
  line?: string;
  onSignOut: () => void;
}) {
  const rank = rankFor(me.gamification.totalXp);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" showCloseButton={false} className="md:hidden">
        <SheetTitle className="sr-only">Account and menu</SheetTitle>

        <div className="mx-auto mt-2.5 h-1.5 w-11 rounded-full bg-border" aria-hidden />

        {/* Identity. A menu that knows who you are beats a settings page. */}
        <div className="flex items-center gap-3.5 px-5 pb-4 pt-5">
          <RankCrest rank={rank} size={52} />
          <div className="min-w-0 flex-1">
            <div className="t-strong truncate">{me.name}</div>
            <div className="t-fine mt-0.5 text-muted-foreground">
              {rank.label} · <NumberTicker value={rank.points} className="num" /> RP ·{' '}
              {me.gamification.streak}d
            </div>
          </div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-[14px] font-semibold">
            {initials(me.name)}
          </span>
        </div>

        {line && (
          <p className="mx-5 mb-4 rounded-md bg-secondary px-3.5 py-3 text-[14px] leading-relaxed text-muted-foreground">
            {line}
          </p>
        )}

        <nav className="px-2.5">
          {items.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex min-h-[52px] items-center gap-3.5 rounded-md px-3.5 transition-colors duration-150 active:bg-secondary',
                  active && 'bg-secondary',
                )}
              >
                <Icon
                  name={item.icon}
                  size={20}
                  className={active ? 'text-foreground' : 'text-muted-foreground'}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn('block t-strong', active && 'font-semibold')}>
                    {item.label}
                  </span>
                  <span className="block text-[12px] text-muted-foreground">{item.hint}</span>
                </span>
                <Icon name="expand" size={16} className="text-muted-foreground" />
              </Link>
            );
          })}
        </nav>

        <div className="mt-3 flex items-center gap-2.5 border-t border-border px-5 py-4">
          <ThemeToggle className="h-11 w-11" />
          <button
            type="button"
            onClick={onSignOut}
            className="btn btn-secondary flex-1 gap-2"
          >
            <Icon name="signOut" size={17} />
            Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
