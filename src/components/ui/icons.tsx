// Icon registry — the single source of truth for every glyph in the product.
//
// Rules that come straight out of docs/DESIGN.md:
//   • one icon set (lucide), one stroke weight, one grid (the 24px box);
//   • colour is never baked in — icons inherit `currentColor`, so an inactive
//     nav item reads muted and an active one reads Action Blue. Emoji is
//     banned here because a glyph with its own palette is a second accent.
//
// Surfaces ask for a semantic key ("review", "streak") rather than importing
// lucide directly, so swapping a glyph is a one-line change in this file.

import {
  ArrowRight,
  Award,
  BadgeCheck,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ChartLine,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheckBig,
  ClipboardList,
  Download,
  FileText,
  Flame,
  Footprints,
  GraduationCap,
  House,
  Layers,
  Library,
  ListChecks,
  Lock,
  LogOut,
  Mail,
  Moon,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Repeat2,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Sprout,
  Sun,
  Target,
  Timer,
  TrendingUp,
  Trash2,
  Trophy,
  Upload,
  UserRound,
  Users,
  Wrench,
  X,
  Zap,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

/** Semantic name → glyph. */
export const icons = {
  // ── navigation ─────────────────────────────────────────────────────────────
  dashboard: House,
  review: Repeat2,
  learn: BookOpen,
  cram: Timer,
  exam: FileText,
  progress: ChartLine,
  library: Package,
  teacher: Users,
  admin: Wrench,

  // ── stats & gamification ───────────────────────────────────────────────────
  due: CircleAlert,
  reviewed: CircleCheckBig,
  correct: Check,
  streak: Flame,
  level: Zap,
  xp: Sparkles,
  league: Trophy,
  rank: TrendingUp,

  // ── actions ────────────────────────────────────────────────────────────────
  next: ArrowRight,
  expand: ChevronRight,
  collapse: ChevronDown,
  search: Search,
  download: Download,
  upload: Upload,
  rotate: RefreshCw,
  add: Plus,
  edit: Pencil,
  remove: Trash2,
  close: X,
  signOut: LogOut,
  sun: Sun,
  moon: Moon,

  // ── domain ─────────────────────────────────────────────────────────────────
  topic: Layers,
  notes: ListChecks,
  spec: ClipboardList,
  class: GraduationCap,
  join: BadgeCheck,
  publish: Rocket,
  private: Lock,
  person: UserRound,
  mail: Mail,
  secure: ShieldCheck,
  achievements: Award,
  start: Footprints,
  schedule: CalendarDays,
  checked: CalendarCheck,
  library2: Library,
  target: Target,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

/** Renders a registry icon at a consistent stroke weight. */
export function Icon({
  name,
  size = 18,
  strokeWidth = 1.75,
  ...props
}: { name: IconName; size?: number; strokeWidth?: number } & Omit<LucideProps, 'size' | 'strokeWidth'>) {
  const Glyph = icons[name];
  return <Glyph size={size} strokeWidth={strokeWidth} aria-hidden {...props} />;
}

// ── Achievements ─────────────────────────────────────────────────────────────
// The database stores an emoji per achievement (scripts/seed.ts). Emoji would
// reintroduce off-palette colour, so achievements resolve to a registry glyph
// by id first, then by the legacy emoji, then to a generic award.

const ACHIEVEMENT_BY_ID: Record<string, IconName> = {
  'first-review': 'start',
  'reviews-50': 'level',
  'reviews-250': 'streak',
  'streak-7': 'schedule',
  'streak-30': 'checked',
  'xp-1000': 'xp',
  'perfect-session': 'target',
};

const ACHIEVEMENT_BY_EMOJI: Record<string, IconName> = {
  '🌱': 'start',
  '⚡': 'level',
  '🔥': 'streak',
  '📅': 'schedule',
  '🗓️': 'checked',
  '💎': 'xp',
  '🎯': 'target',
};

/** Resolve an achievement row to a registry icon name. */
export function achievementIcon(id?: string, legacyEmoji?: string): IconName {
  if (id && ACHIEVEMENT_BY_ID[id]) return ACHIEVEMENT_BY_ID[id];
  if (legacyEmoji && ACHIEVEMENT_BY_EMOJI[legacyEmoji]) return ACHIEVEMENT_BY_EMOJI[legacyEmoji];
  return 'achievements';
}

// ── Leagues ──────────────────────────────────────────────────────────────────
// Leagues carry a hex colour in LEAGUE_META. Rank inside a leaderboard is
// communicated by position and weight, not by hue — the design system has one
// accent. Leagues therefore map to a glyph only.

/** Registry glyph per league tier. */
export function leagueIcon(tier: string): IconName {
  const tiers: Record<string, IconName> = {
    bronze: 'start',
    silver: 'league',
    gold: 'league',
    diamond: 'xp',
    legend: 'achievements',
  };
  return tiers[tier] ?? 'league';
}
