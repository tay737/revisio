'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useMe, learnerSnapshot, signOut } from '@/lib/useMe';
import { companionFor, greetingFor } from '@/lib/profile';
import { routeVariants } from '@/lib/motion';
import { Sidebar } from '@/components/nav/Sidebar';
import { TopBar } from '@/components/nav/TopBar';
import { BottomNav } from '@/components/nav/BottomNav';
import { AccountSheet } from '@/components/nav/AccountSheet';
import PageSkeleton from '@/components/PageSkeleton';
import {
  isActivePath,
  navForRole,
  overflowItems,
  primaryTabs,
} from '@/components/nav/routes';

/**
 * The application shell — composition only.
 *
 * It owns three things and nothing else:
 *
 *   1. **The session.** It is the only place that reads `/me` (through `useMe`,
 *      the single SWR entry every page shares) and the only place that redirects
 *      a signed-out visitor.
 *   2. **One piece of UI state** — whether the account sheet is open.
 *   3. **The route transition.** Content animates *in*; nothing waits for it.
 *      `AnimatePresence mode="wait"` used to hold every navigation behind the
 *      outgoing page's exit animation, which was the single biggest reason
 *      moving around the app felt sluggish.
 *
 * `--nav-h` is declared here because the shell is what knows the mobile bar's
 * height; `.nav-offset` (globals.css) consumes it so no page has to guess how
 * much room to leave at the bottom of a phone screen.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { me, error, loading } = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    if (error) router.replace('/login');
  }, [error, router]);

  // A sheet left open across a navigation would sit on top of the new page.
  useEffect(() => {
    setAccountOpen(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);

  const nav = useMemo(() => navForRole(me?.role), [me?.role]);
  const tabs = useMemo(() => primaryTabs(nav), [nav]);
  const overflow = useMemo(() => overflowItems(nav), [nav]);
  const greeting = useMemo(() => (me ? greetingFor(me.name) : ''), [me]);

  // The companion reads the same snapshot every other surface displays, so the
  // sheet's line and the dashboard's can never disagree about the state.
  const companionLine = useMemo(() => (me ? companionFor(learnerSnapshot(me)).line : ''), [me]);

  if (loading) return <PageSkeleton variant="reader" />;
  if (!me) return null;

  const onSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const overflowActive = overflow.some((item) => isActivePath(pathname, item.href));

  return (
    <div className="flex min-h-screen" style={{ '--nav-h': '64px' } as React.CSSProperties}>
      <Sidebar nav={nav} pathname={pathname} me={me} onSignOut={onSignOut} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          pathname={pathname}
          me={me}
          greeting={greeting}
          companionLine={companionLine}
          onOpenAccount={() => setAccountOpen(true)}
        />

        <main className="nav-offset mx-auto w-full max-w-[1080px] flex-1 px-4 pt-5 md:px-8 md:pt-7">
          <motion.div key={pathname} variants={routeVariants} initial="hidden" animate="show">
            {children}
          </motion.div>
        </main>
      </div>

      <BottomNav
        tabs={tabs}
        pathname={pathname}
        due={me.today.due}
        overflowActive={overflowActive}
        onMore={() => setAccountOpen(true)}
      />

      <AccountSheet
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        items={overflow}
        pathname={pathname}
        me={me}
        line={companionLine}
        onSignOut={onSignOut}
      />
    </div>
  );
}
