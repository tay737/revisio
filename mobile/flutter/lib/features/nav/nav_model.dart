/// The navigation model — the Dart port of `src/components/nav/routes.ts`.
///
/// Single owner of the app's destinations: the TopBar title, the BottomNav
/// tabs, the AccountSheet rows and the role gates all read this list, so a
/// destination can never appear in one surface and be missing from another.
///
/// `path` is the Flutter route; `webHref` records the web href it maps to
/// (docs/FLUTTER-UI-REPLICA-SPEC-2026-11-15.md §1a).
library revisio.features.nav.nav_model;

/// One destination. [roles] null = every signed-in role.
class NavItem {
  final String path;
  final String webHref;
  final String label;
  final String icon;
  final String hint;
  final List<String>? roles;

  const NavItem({
    required this.path,
    required this.webHref,
    required this.label,
    required this.icon,
    required this.hint,
    this.roles,
  });
}

const List<NavItem> kNav = [
  NavItem(
    path: '/today',
    webHref: '/dashboard',
    label: 'Today',
    icon: 'dashboard',
    hint: 'Your queue and streak',
  ),
  NavItem(
    path: '/review',
    webHref: '/review',
    label: 'Review',
    icon: 'review',
    hint: 'Clear the cards due',
  ),
  NavItem(
    path: '/learn',
    webHref: '/learn',
    label: 'Learn',
    icon: 'learn',
    hint: 'Notes behind the cards',
  ),
  NavItem(
    path: '/rank',
    webHref: '/progress',
    label: 'Rank',
    icon: 'rank',
    hint: 'Ladder and weekly lobby',
  ),
  NavItem(
    path: '/cram',
    webHref: '/cram',
    label: 'Cram',
    icon: 'cram',
    hint: 'Sprint before an exam',
  ),
  NavItem(
    path: '/exam',
    webHref: '/exam',
    label: 'Exam',
    icon: 'exam',
    hint: 'Sit a marked paper',
  ),
  NavItem(
    path: '/practice',
    webHref: '/practice',
    label: 'Practice',
    icon: 'practice',
    hint: 'Generated maths drills',
  ),
  NavItem(
    path: '/library',
    webHref: '/library',
    label: 'Library',
    icon: 'library',
    hint: 'Subjects and topics',
  ),
  NavItem(
    path: '/settings',
    webHref: '/settings',
    label: 'Settings',
    icon: 'person',
    hint: 'Profile and account',
  ),
  NavItem(
    path: '/teacher',
    webHref: '/teacher',
    label: 'Teaching',
    icon: 'teacher',
    hint: 'Classes and students',
    roles: ['teacher', 'developer'],
  ),
  NavItem(
    path: '/admin',
    webHref: '/admin',
    label: 'Admin',
    icon: 'admin',
    hint: 'Users and content',
    roles: ['developer'],
  ),
];

/// The student-progress route has no web href — it is the mobile drill-in
/// from a roster row. Labelled for the TopBar only.
const NavItem kStaffStudent = NavItem(
  path: '/staff/student',
  webHref: '/staff/student',
  label: 'Progress',
  icon: 'review',
  hint: 'One student at a time',
);

/// The four destinations a thumb reaches without a second tap.
const List<String> kPrimaryPaths = ['/today', '/review', '/learn', '/rank'];

List<NavItem> navForRole(String? role) => [
  for (final item in kNav)
    if (item.roles == null || (role != null && item.roles!.contains(role)))
      item,
];

List<NavItem> primaryTabs(List<NavItem> items) => [
  for (final path in kPrimaryPaths)
    if (items.any((i) => i.path == path))
      items.firstWhere((i) => i.path == path),
];

List<NavItem> overflowItems(List<NavItem> items) => [
  for (final i in items)
    if (!kPrimaryPaths.contains(i.path)) i,
];

bool isActivePath(String path, String href) =>
    path == href || path.startsWith('$href/');

/// Whether [path] is any overflow destination — drives the More slot's
/// active state.
bool overflowActive(String path, List<NavItem> items) =>
    overflowItems(items).any((i) => isActivePath(path, i.path));

/// The title a screen shows in the mobile bar. One owner for those strings.
String labelForPath(String path) {
  for (final item in kNav) {
    if (isActivePath(path, item.path)) return item.label;
  }
  if (isActivePath(path, kStaffStudent.path)) return kStaffStudent.label;
  return 'Revisio';
}
