'use client';

import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

/**
 * The pre-answer confidence tap (F5): "did you know it?" — two chips, nothing
 * selected by default, APG radiogroup semantics (role=radiogroup, role=radio,
 * arrow keys move and select). v1 stores the answer without acting on it, so
 * the copy stays silent about effects — scaffolding, not a lever.
 *
 * Shared by the daily/learn panel and cram — cram is where guessing is most
 * common, so the metacognition signal matters most there.
 */
export function ConfidencePicker({
  value,
  onChange,
  disabled,
}: {
  value: 'knew' | 'guessed' | null;
  onChange?: (v: 'knew' | 'guessed') => void;
  disabled?: boolean;
}) {
  const options = [
    { v: 'knew' as const, label: 'I knew it' },
    { v: 'guessed' as const, label: 'I guessed' },
  ];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const pick = (v: 'knew' | 'guessed') => {
    if (disabled) return;
    onChange?.(v);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.v === value);
    const next = options[(Math.max(i, 0) + delta + options.length) % options.length];
    pick(next.v);
    refs.current[(Math.max(i, 0) + delta + options.length) % options.length]?.focus();
  };

  return (
    <div className="mt-3" role="radiogroup" aria-label="Before you check: did you know it?" onKeyDown={onKeyDown}>
      <p className="t-fine mb-1.5 text-muted-foreground">Before you check: did you know it? (optional, helps your insights)</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => {
          const on = value === o.v;
          return (
            <button
              key={o.v}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on || (value === null && i === 0) ? 0 : -1}
              disabled={disabled}
              onClick={() => pick(o.v)}
              className={cn('chip min-h-11 transition-colors', on && 'chip-active', disabled && 'opacity-60')}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
