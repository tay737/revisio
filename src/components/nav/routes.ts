// The navigation model — one owner of what the app's destinations are, so the
// sidebar, the mobile tab bar, the sheet and the command surface cannot drift
// apart. Each surface decides *how many* of these it can show; none of them
// keeps a second list.

import type { IconName } from '@/components/ui/icons';

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** One line explaining the destination — used by the sheet, where there is
   *  room for it, and by the tooltip/title elsewhere. */
  hint: string;
  /** Which roles may see it. `student` is the default audience. */
  roles?: ('student' | 'teacher' | 'developer')[];
};

export const NAV: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Today',
    icon: 'dashboard',
    hint: 'Your queue, streak and rank at a glance',
  },
  {
    href: '/review',
    label: 'Review',
    icon: 'review',
    hint: 'Work the cards the scheduler scheduled',
  },
  {
    href: '/learn',
    label: 'Learn',
    icon: 'learn',
    hint: 'Read the notes behind every card',
  },
  {
    href: '/progress',
    label: 'Rank',
    icon: 'rank',
    hint: 'Rank, weekly lobby, achievements and transcript',
  },
  {
    href: '/cram',
    label: 'Cram',
    icon: 'cram',
    hint: 'Rapid questions before an exam, scheme untouched',
  },
  {
    href: '/exam',
    label: 'Exam',
    icon: 'exam',
    hint: 'Sit a paper marked against the mark scheme',
  },
  {
    href: '/library',
    label: 'My content',
    icon: 'library',
    hint: 'Your subjects, topics and imported cards',
  },
  {
    href: '/teacher',
    label: 'Teaching',
    icon: 'teacher',
    hint: 'Classes, join codes and student progress',
    roles: ['teacher', 'developer'],
  },
  {
    href: '/admin',
    label: 'Admin',
    icon: 'admin',
    hint: 'Users, content and system configuration',
    roles: ['developer'],
  },
];

/**
 * The four destinations a thumb can reach without a second tap, in order.
 * Everything else lives behind the sheet — which is the whole fix for the old
 * bar, where the five-item truncation silently dropped Progress and My content
 * off a phone entirely.
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
