'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useMe, learnerSnapshot, signOut } from '@/lib/useMe';
import { Splash } from '@/components/ui/splash';
import { companionFor, greetingFor } from '@/lib/profile';
import { rankFor } from '@/domain/ranked';
import { routeVariants } from '@/lib/motion';
import { Sidebar } from '@/components/nav/Sidebar';
import { SessionHeader } from '@/components/nav/SessionHeader';
import { MobileTabBar } from '@/components/nav/MobileTabBar';
import { MoreSheet } from '@/components/nav/MoreSheet';
import {
  isActivePath,
  navForRole,
  overflowItems,
  primaryTabs,
} from '@/components/nav/routes';

/**
 * The application shell — composition only.
 *
 * It used to be a single 380-line component that also owned the navigation
 * model, the desktop sidebar, the mobile tab bar, the overflow sheet and the
 * learner card. Each of those now has one owner under `components/nav`, and
 * this file does three things:
 *
 *   1. **Owns the session.** It is the only place that fetches `/me` (through
 *      `useMe`, the single cache entry every page reads) and the only place
 *      that redirects a signed-out visitor.
 *   2. **Owns one piece of UI state** — whether the overflow sheet is open.
 *      Everything else about the sheet belongs to the sheet.
 *   3. **Routes the transition.** Content animates *in*; nothing waits for it.
 *      `AnimatePresence mode="wait"` used to hold every navigation behind the
 *      outgoing page's exit animation, which is the single biggest reason the
 *      app felt sluggish to move around.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { me, error, loading } = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (error) router.replace('/login');
  }, [error, router]);

  // A sheet left open across a navigation would sit on top of the new page.
  useEffect(() => {
    setSheetOpen(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);

  const nav = useMemo(() => navForRole(me?.role), [me?.role]);
  const tabs = useMemo(() => primaryTabs(nav), [nav]);
  const overflow = useMemo(() => overflowItems(nav), [nav]);

  const greeting = useMemo(() => (me ? greetingFor(me.name) : ''), [me]);

  const rank = useMemo(() => (me ? rankFor(me.gamification.totalXp) : null), [me]);

  // The companion reads the same snapshot the rest of the app displays, so the
  // header line and every other surface can never disagree about the state.
  const companionLine = useMemo(() => (me ? companionFor(learnerSnapshot(me)).line : ''), [me]);

  if (loading) return <Splash show />;
  if (!me || !rank) return null;

  const onSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const overflowActive = overflow.some((item) => isActivePath(pathname, item.href));

  return (
    <div className="flex min-h-screen">
      <Sidebar nav={nav} pathname={pathname} me={me} onSignOut={onSignOut} />

      <div className="flex min-w-0 flex-1 flex-col">
        <SessionHeader
          pathname={pathname}
          me={me}
          greeting={greeting}
          companionLine={companionLine}
          rankPoints={rank.points}
        />

        {/* Bottom padding clears the floating tab bar on a phone. */}
        <main className="mx-auto w-full max-w-measure flex-1 px-4 py-6 pb-32 md:px-6 md:py-8 md:pb-10">
          <motion.div key={pathname} variants={routeVariants} initial="hidden" animate="show">
            {children}
          </motion.div>
        </main>
      </div>

      <MobileTabBar
        tabs={tabs}
        pathname={pathname}
        due={me.today.due}
        overflowActive={overflowActive}
        onMore={() => setSheetOpen(true)}
      />

      <MoreSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        items={overflow}
        pathname={pathname}
        me={me}
        onSignOut={onSignOut}
      />
    </div>
  );
}
