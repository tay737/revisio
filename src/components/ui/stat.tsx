import { Icon, type IconName } from '@/components/ui/icons';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Card } from '@/components/ui/card';

/**
 * One statistic, on the one stat row.
 *
 * The dashboard grew its own `Stat` first and the Rank page grew another, with
 * the same four props and slightly different sizes — the exact drift the UI
 * system exists to stop (`docs/UI-SYSTEM.md` §5, one size per kind of element).
 * A page passes the numbers; this owns the geometry.
 *
 * `tone` is state, not decoration: green for something waiting for the learner,
 * the streak colour for a streak that is alive. A zero or an ordinary count is
 * muted ink, because colour appears only where the product has something to
 * report.
 */
export function Stat({
  icon,
  label,
  value,
  suffix,
  tone,
}: {
  icon: IconName;
  label: string;
  value: number | string;
  suffix?: string;
  tone?: 'good' | 'streak';
}) {
  const tint =
    tone === 'good'
      ? 'text-good-strong'
      : tone === 'streak'
        ? 'text-streak-pressed'
        : 'text-muted-foreground';

  return (
    <Card className="p-4">
      <div className={`flex items-center gap-1.5 ${tone ? tint : 'text-muted-foreground'}`}>
        <Icon name={icon} size={15} />
        <span className="t-fine">{label}</span>
      </div>
      <div className="mt-1.5 t-num-sm">
        {typeof value === 'number' ? <NumberTicker value={value} className="num" /> : value}
        {suffix && <span className="t-fine font-normal text-muted-foreground">{suffix}</span>}
      </div>
    </Card>
  );
}
