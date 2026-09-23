'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/useSession';

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
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="animate-pulse text-muted">Loading…</div>
      </main>
    );
  }
  if (!user) return null;

  const nav = [...studentNav, ...(user.role === 'student' ? [] : teacherNav), ...(user.role === 'developer' ? devNav : [])];
  const gam = (user as unknown as { gamification?: { level: number; streak: number; totalXp: number } }).gamification;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-edge bg-panel px-4 py-5 md:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink">R</span>
          Revisio
        </Link>
        <nav className="flex-1 space-y-1">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${active ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-edge/40 hover:text-ink'}`}>
                <span>{item.icon}</span> {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-edge pt-4">
          <div className="flex items-center gap-3 px-1">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-accent/15 font-bold text-accent">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{user.name}</div>
              <div className="text-xs capitalize text-muted">{user.role}</div>
            </div>
          </div>
          <button onClick={logout} className="btn-ghost w-full text-xs">Sign out</button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-edge bg-panel/80 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-2 md:hidden">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-xs font-bold text-accent-ink">R</span>
            <span className="font-bold">Revisio</span>
          </div>
          {gam && (
            <div className="ml-auto flex items-center gap-3 text-sm">
              <span className="chip">⚡ Lv {gam.level}</span>
              <span className="chip">🔥 {gam.streak}d</span>
              <span className="chip hidden sm:inline-flex">✨ {gam.totalXp} XP</span>
            </div>
          )}
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-6">{children}</main>

        <nav className="sticky bottom-0 z-10 flex justify-around border-t border-edge bg-panel/95 py-2 backdrop-blur md:hidden">
          {nav.slice(0, 5).map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href} className={`flex flex-col items-center rounded-lg px-3 py-1 text-[11px] ${active ? 'text-accent' : 'text-muted'}`}>
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
