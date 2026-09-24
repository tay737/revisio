import { Icon, type IconName } from '@/components/ui/icons';

/**
 * The header every app page opens with.
 *
 * It existed as hand-written markup on eight pages with slightly different
 * sizes and weights each time, which is how a design system drifts. One
 * component now owns the page-title treatment: 40px/600 display type on
 * desktop, 34px on phones, an Action-Blue glyph disc, and a 17px supporting
 * line. Pages pass content, not typography.
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
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3.5">
        {icon && (
          <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
            <Icon name={icon} size={20} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="display-tight t-title">{title}</h1>
          {subtitle && <p className="t-caption mt-1.5 max-w-2xl text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
