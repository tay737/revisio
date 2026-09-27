import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icons';

// ── Account type ────────────────────────────────────────────────────────────
// One chip, three labels. The role is public information on a profile (it
// explains why someone can edit a library), but it is earned, not decorative:
// staff and developer get the two marked treatments, students stay quiet.

const ROLES = {
  student: { label: 'Student', icon: 'learn', className: 'border-border bg-secondary text-muted-foreground' },
  teacher: { label: 'Teacher', icon: 'teacher', className: 'border-primary/30 bg-primary/10 text-primary' },
  developer: { label: 'Developer', icon: 'xp', className: 'border-gold/40 bg-gold/20 text-foreground' },
} as const;

export type ProfileRole = keyof typeof ROLES;

export function RoleBadge({ role, className }: { role: string; className?: string }) {
  const def = ROLES[(role as ProfileRole) in ROLES ? (role as ProfileRole) : 'student'];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        def.className,
        className,
      )}
    >
      <Icon name={def.icon} size={11} />
      {def.label}
    </span>
  );
}
