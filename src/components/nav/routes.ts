// The navigation model — the single owner of what the app's destinations are.
// The sidebar, the bottom bar, the account sheet and the page titles all read
// this list; none of them keeps a second copy, so a destination can never
// appear in one surface and be missing from another.
//
// Copy rule (docs/DESIGN-DUOLINGO.md, "concise, easy to read"): a label is one
// word where possible, and a hint is at most four. There is no prose here.

import type { IconName } from '@/components/ui/icons';

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Four words at most. Shown in the account sheet, never in the bar. */
  hint: string;
  /** Which roles may see it. `student` is the default audience. */
  roles?: ('student' | 'teacher' | 'developer')[];
};

export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Today', icon: 'dashboard', hint: 'Your queue and streak' },
  { href: '/review', label: 'Review', icon: 'review', hint: 'Clear the cards due' },
  { href: '/learn', label: 'Learn', icon: 'learn', hint: 'Notes behind the cards' },
  { href: '/progress', label: 'Rank', icon: 'rank', hint: 'Ladder and weekly lobby' },
  { href: '/cram', label: 'Cram', icon: 'cram', hint: 'Sprint before an exam' },
  { href: '/exam', label: 'Exam', icon: 'exam', hint: 'Sit a marked paper' },
  { href: '/library', label: 'Library', icon: 'library', hint: 'Subjects and topics' },
  {
    href: '/teacher',
    label: 'Teaching',
    icon: 'teacher',
    hint: 'Classes and students',
    roles: ['teacher', 'developer'],
  },
  {
    href: '/admin',
    label: 'Admin',
    icon: 'admin',
    hint: 'Users and content',
    roles: ['developer'],
  },
];

/**
 * The four destinations a thumb reaches without a second tap. Everything else
 * lives one tap behind More — the old bar truncated silently at five items,
 * which put Rank and Library out of reach on a phone entirely.
 */
export const PRIMARY_TABS = ['/dashboard', '/review', '/learn', '/progress'];

export function navForRole(role: string | undefined): NavItem[] {
  return NAV.filter((item) => !item.roles || (role && item.roles.includes(role as never)));
}

export function primaryTabs(items: NavItem[]): NavItem[] {
  return PRIMARY_TABS.map((href) => items.find((i) => i.href === href)).filter(
    (i): i is NavItem => Boolean(i),
  );
}

export function overflowItems(items: NavItem[]): NavItem[] {
  return items.filter((i) => !PRIMARY_TABS.includes(i.href));
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The title a screen shows in the mobile bar. One owner for those strings. */
export function labelForPath(pathname: string): string {
  const item = NAV.find((i) => isActivePath(pathname, i.href));
  return item?.label ?? 'Revisio';
}
