import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/components/ui/icons';

// ── Profile badges ──────────────────────────────────────────────────────────
// Developer-minted chips that ride beside the role badge on a profile — a
// '<3', an 'Alpha Tester', whatever a developer mints. Four treatments, all
// token-based so light and dark both read. `label` is free text (a badge can
// literally be '<3'), so the chip renders it verbatim and never as an icon.

const TREATMENTS = {
  gold: 'border-gold/40 bg-gold/20 text-foreground',
  primary: 'border-primary/30 bg-primary/10 text-primary',
  good: 'border-good/40 bg-good-soft text-good-pressed',
  rose: 'border-destructive/40 bg-destructive/15 text-destructive',
} as const;

export type BadgeColor = keyof typeof TREATMENTS;

export function ProfileBadgeChip({
  label,
  icon,
  color,
  className,
}: {
  label: string;
  icon?: string | null;
  color?: string | null;
  className?: string;
}) {
  const treatment = TREATMENTS[(color ?? 'gold') as BadgeColor] ?? TREATMENTS.gold;
  return (
    <span
      className={cn(
        'inline-flex max-w-[180px] items-center gap-1 truncate rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        treatment,
        className,
      )}
      title={label}
    >
      {icon ? <Icon name={icon as IconName} size={11} /> : null}
      {label}
    </span>
  );
}
