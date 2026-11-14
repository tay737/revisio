import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/icons';
import { buttonVariants } from '@/lib/button-variants';

/**
 * One empty state, everywhere.
 *
 * Every list in the app used to invent its own: a tinted blue disc, a heading,
 * a paragraph of encouragement, sometimes a button, sometimes not. That is why
 * Learn, My content and Practice had three different ideas of what "nothing
 * here yet" looks like. The rule is the same as everywhere else — say what will
 * appear and give the one action that fills it — so it is a component, not a
 * paragraph a page writes for itself.
 *
 * The glyph disc is `bg-secondary`, never a tint: in a system where colour means
 * state, a decorative container is not state (UI-SYSTEM §3).
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon: IconName;
  title: string;
  body?: string;
  /** A destination, because an empty state's job is to be left. */
  action?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={`card p-8 text-center ${className ?? ''}`}>
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary">
        <Icon name={icon} size={22} />
      </span>
      <h2 className="mt-4 t-tagline">{title}</h2>
      {body && <p className="mx-auto mt-2 max-w-sm t-caption text-muted-foreground">{body}</p>}
      {action && (
        <Link href={action.href} className={buttonVariants({ variant: 'primary', className: 'mt-5 inline-flex' })}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
