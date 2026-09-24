'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMe, signOut } from '@/lib/useMe';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Splash } from '@/components/ui/splash';
import { Icon, type IconName } from '@/components/ui/icons';
import { NumberTicker } from '@/components/ui/motion/number-ticker';
import { DUR, EASE, pageVariants, SPRING } from '@/lib/motion';
import { greetingFor, initials, levelCaption, levelPercent, nudge } from '@/lib/profile';
import { cn } from '@/lib/utils';

/**
 * The application shell.
 *
 * Three things were wrong with the previous version and are fixed here:
 *
 *  1. **Icons.** Nav items carried emoji, which inject their own palette into a
 *     system that allows exactly one accent colour. They now come from the
 *     registry in `ui/icons`, inherit `currentColor`, and so read muted at rest
 *     and Action Blue when active.
 *  2. **Motion.** Every timing was hardcoded in place. The shell now consumes
 *     the tokens in `lib/motion`, and route changes cross-fade in place instead
 *     of being covered by a timed full-screen splash.
 *  3. **Voice.** The chrome was anonymous. The header now greets the learner by
 *     name with a line derived from their own numbers (`lib/profile`), so every
 *     page in the app is addressed to a person rather than a user record.
 *
 * Desktop gets a 44px-row sidebar; mobile gets the spec's frosted tab bar.
 */

type NavItem = { href: string; label: string; icon: IconName };

const studentNav: NavItem[] = [
  { href: '/dashboard', label: 'Today', icon: 'dashboard' },
  { href: '/review', label: 'Review', icon: 'review' },
  { href: '/learn', label: 'Learn', icon: 'learn' },
  { href: '/cram', label: 'Cram', icon: 'cram' },
  { href: '/exam', label: 'Exam', icon: 'exam' },
  { href: '/progress', label: 'Progress', icon: 'progress' },
  { href: '/library', label: 'My content', icon: 'library' },
];

const staffNav: NavItem[] = [{ href: '/teacher', label: 'Teaching', icon: 'teacher' }];
const devNav: NavItem[] = [{ href: '/admin', label: 'Admin', icon: 'admin' }];

const PRIMARY_TABS = 4;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { me, error, loading } = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  // The shell owns the signed-out redirect: every app route sits inside it, so
  // the check exists once rather than in each page.
  useEffect(() => {
    if (error) router.replace('/login');
  }, [error, router]);

  // A sheet left open across a navigation would sit on top of the new page.
  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  const nav = useMemo(() => {
    if (!me) return studentNav;
    return [
      ...studentNav,
      ...(me.role === 'student' ? [] : staffNav),
      ...(me.role === 'developer' ? devNav : []),
    ];
  }, [me]);

  const greeting = useMemo(() => (me ? greetingFor(me.name) : ''), [me]);
  // `nudge` reads only today's numbers plus the streak, so the shell hands it
  // exactly that rather than the whole profile.
  const nudgeLine = useMemo(
    () =>
      (me ? nudge({ due: me.today.due, reviewed: me.today.reviewed, correct: me.today.correct, streak: me.gamification.streak }) : ''),
    [me],
  );

  if (loading) return <Splash show />;
  if (!me) return null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const overflowActive = nav.slice(PRIMARY_TABS).some((item) => isActive(item.href));

  const onSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar (desktop) ─────────────────────────────────────────────── */}
      <aside className="glass-bar sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-edge/70 px-3 py-5 md:flex">
        <Link
          href="/dashboard"
          className="mb-6 flex items-center gap-2.5 px-2 text-[17px] font-semibold tracking-[-0.374px]"
        >
          <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-accent text-[12px] font-semibold text-accent-ink">
            R
          </span>
          Revisio
        </Link>

        <nav className="flex-1 space-y-0.5" aria-label="Primary">
          {nav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-11 items-center gap-3 rounded-full px-3 text-[14px] leading-[1.29] tracking-[-0.224px] transition-colors duration-150',
                  active ? 'text-accent' : 'text-muted hover:text-ink',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-full bg-accent/10"
                    transition={SPRING.layout}
                  />
                )}
                <span className="relative grid w-5 place-items-center">
                  <Icon name={item.icon} size={18} />
                </span>
                <span className={cn('relative', active && 'font-semibold')}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* ── Learner card: the shell's personal moment ───────────────────── */}
        <div className="mt-4 space-y-3 border-t border-edge/70 pt-4">
          <div className="px-2">
            <div className="flex items-baseline justify-between">
              <span className="t-caption-s text-muted">Level {me.gamification.level}</span>
              <span className="t-fine tabular-nums text-muted">
                {me.gamification.intoLevel} / {me.gamification.forNext}
              </span>
            </div>
            <div className="meter mt-1.5">
              <motion.div
                className="h-full rounded-full bg-accent"
                initial={{ width: 0 }}
                animate={{ width: `${levelPercent(me.gamification)}%` }}
                transition={SPRING.meter}
              />
            </div>
            <p className="t-fine mt-1.5 text-muted">{levelCaption(me.gamification)}</p>
          </div>

          <div className="flex items-center gap-2.5 px-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/15 text-[14px] font-semibold text-accent">
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
            <button
              type="button"
              onClick={onSignOut}
              className="btn-ghost h-11 flex-1 gap-2"
              aria-label="Sign out"
            >
              <Icon name="signOut" size={16} />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Header: frosted bar, addressed to the learner ──────────────── */}
        <header className="glass-bar sticky top-0 z-20 flex h-[52px] items-center gap-3 border-b border-edge/70 px-4 md:px-6">
          <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
            <span className="grid h-6 w-6 place-items-center rounded-[6px] bg-accent text-[11px] font-semibold text-accent-ink">
              R
            </span>
            <span className="t-strong">Revisio</span>
          </Link>

          <p className="hidden min-w-0 md:block">
            <span className="t-caption-s">{greeting}</span>
            <span className="t-caption mx-2 text-muted">·</span>
            <span className="t-caption text-muted">{nudgeLine}</span>
          </p>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="chip" title={`${me.today.due} cards due today`}>
              <Icon name="due" size={14} className="text-accent" />
              <span className="tabular-nums">{me.today.due}</span>
              <span className="hidden sm:inline">due</span>
            </span>
            <span className="chip" title={`${me.gamification.streak}-day streak`}>
              <Icon name="streak" size={14} className="text-accent" />
              <span className="tabular-nums">{me.gamification.streak}</span>
              <span className="hidden sm:inline">day{me.gamification.streak === 1 ? '' : 's'}</span>
            </span>
            <span className="chip hidden lg:inline-flex" title="Total XP">
              <Icon name="xp" size={14} className="text-accent" />
              <NumberTicker value={me.gamification.totalXp} className="tabular-nums" />
              <span>XP</span>
            </span>
            <span className="md:hidden">
              <ThemeToggle className="h-9 w-9" />
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[980px] flex-1 px-4 py-6 md:px-6 md:py-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              variants={pageVariants}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* ── Mobile tab bar + overflow sheet (spec's frosted sticky bar) ── */}
        <nav
          className="glass-bar sticky bottom-0 z-20 flex items-stretch border-t border-edge/70 pb-[env(safe-area-inset-bottom)] md:hidden"
          aria-label="Primary"
        >
          {nav.slice(0, PRIMARY_TABS).map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150',
                  active ? 'text-accent' : 'text-muted',
                )}
              >
                <Icon name={item.icon} size={20} />
                <span className="t-fine">{item.label}</span>
                {active && (
                  <motion.span
                    layoutId="tab-active"
                    className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-accent"
                    transition={SPRING.layout}
                  />
                )}
              </Link>
            );
          })}

          {/* Everything past the fourth tab lives here. Previously the tab bar
              simply truncated at five items, which left Progress and My content
              unreachable on a phone. */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-expanded={sheetOpen}
            aria-haspopup="menu"
            className={cn(
              'relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150',
              overflowActive ? 'text-accent' : 'text-muted',
            )}
          >
            <Icon name="collapse" size={20} />
            <span className="t-fine">More</span>
            {overflowActive && (
              <motion.span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-accent" />
            )}
          </button>
        </nav>

        <AnimatePresence>
          {sheetOpen && (
            <motion.div
              className="fixed inset-0 z-40 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.quick, ease: EASE.out }}
            >
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setSheetOpen(false)}
                className="absolute inset-0 h-full w-full cursor-default bg-ink/25 backdrop-blur-sm"
              />
              <motion.div
                role="menu"
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 24, opacity: 0 }}
                transition={SPRING.soft}
                className="glass-bar absolute inset-x-0 bottom-0 rounded-t-[18px] border-t border-edge/70 px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2"
              >
                <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-edge" />
                {nav.slice(PRIMARY_TABS).map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      className={cn(
                        'flex h-12 items-center gap-3 rounded-[11px] px-3 text-[17px] transition-colors duration-150',
                        active ? 'bg-accent/10 font-semibold text-accent' : 'text-ink',
                      )}
                    >
                      <Icon name={item.icon} size={19} />
                      {item.label}
                    </Link>
                  );
                })}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
