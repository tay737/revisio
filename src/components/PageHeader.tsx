import { Icon, type IconName } from '@/components/ui/icons';

/**
 * The header every app page opens with.
 *
 * It existed as hand-written markup on eight pages with slightly different sizes
 * and weights, which is how a design system drifts. One component now owns the
 * page-title treatment — 26px/700 display type, a monochrome glyph disc and a
 * one-line subtitle. Pages pass content, not typography.
 *
 * The glyph disc is `bg-secondary` rather than a tinted accent: in a system where
 * colour means state, an icon container is not state, and eight pages' worth of
 * tinted discs was the largest source of leftover-blue in the old app.
 */
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary">
            <Icon name={icon} size={19} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="t-title">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 max-w-2xl text-[14px] leading-snug text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
