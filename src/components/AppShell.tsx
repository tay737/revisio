'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useSession } from '@/lib/useSession';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Splash } from '@/components/ui/splash';

const studentNav = [
  { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { href: '/review', label: 'Review', icon: '🔁' },
  { href: '/learn', label: 'Learn', icon: '📚' },
  { href: '/cram', label: 'Cram', icon: '⏱️' },
  { href: '/exam', label: 'Exam', icon: '📄' },
  { href: '/progress', label: 'Progress', icon: '📈' },
  { href: '/library', label: 'My content', icon: '📦' },
];

const teacherNav = [
  { href: '/teacher', label: 'Teacher', icon: '👥' },
];

const devNav = [
  { href: '/admin', label: 'Admin', icon: '🛠️' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useSession();
  const pathname = usePathname();

  if (loading) {
    return <Splash show />;
  }
  if (!user) return null;

  const nav = [...studentNav, ...(user.role === 'student' ? [] : teacherNav), ...(user.role === 'developer' ? devNav : [])];
  const gam = (user as unknown as { gamification?: { level: number; streak: number; totalXp: number } }).gamification;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-edge bg-panel px-4 py-5 md:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-[11px] font-bold text-accent-ink">R</span>
          Revisio
        </Link>
        <nav className="flex-1 space-y-0.5">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href}
                className={`relative flex items-center gap-3 rounded-full px-3 py-2 text-[13px] font-medium transition-colors ${active ? 'text-accent' : 'text-muted hover:text-ink'}`}>
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full bg-accent/10"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">{item.icon}</span>
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-edge pt-4">
          <div className="flex items-center gap-3 px-1">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-accent/15 font-semibold text-accent">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold">{user.name}</div>
              <div className="text-xs capitalize text-muted">{user.role}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <ThemeToggle />
            <button onClick={logout} className="btn-ghost h-9 flex-1 !px-3 text-xs">Sign out</button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="frosted sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-edge px-5 py-3">
          <div className="flex items-center gap-2 md:hidden">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-xs font-bold text-accent-ink">R</span>
            <span className="text-[15px] font-semibold tracking-tight">Revisio</span>
          </div>
          {gam && (
            <div className="ml-auto flex items-center gap-2 text-[13px]">
              <span className="chip">⚡ Lv {gam.level}</span>
              <span className="chip">🔥 {gam.streak}d</span>
              <span className="chip hidden sm:inline-flex">✨ {gam.totalXp} XP</span>
            </div>
          )}
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
              transition={{ duration: 0.22, ease: [0.21, 0.47, 0.32, 0.98] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        <nav className="frosted sticky bottom-0 z-10 flex justify-around border-t border-edge py-2 md:hidden">
          {nav.slice(0, 5).map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href} className={`flex flex-col items-center rounded-full px-3 py-1 text-[11px] transition-colors ${active ? 'text-accent' : 'text-muted'}`}>
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
