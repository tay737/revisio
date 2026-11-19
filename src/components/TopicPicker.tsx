'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { unitFromTopic, topicSortKey } from '@/app/(app)/learn/[subjectId]/shared';

/**
 * The grouped topic picker shared by Cram and the exam builder.
 *
 * ~80 flat chips was the audit's complaint: ungrouped, unordered, forgetful.
 * This owns the three fixes once — subjects → spec units → chips, a search
 * box once the list is long enough to need one, and a remembered selection
 * (localStorage) with an optional "weakest N" auto-pick for first visits.
 *
 * Selection itself stays controlled: parents own `picked` because the submit
 * payloads differ per surface.
 */
export type TopicPickerItem = {
  id: string;
  name: string;
  subjectName?: string;
  /** Optional per-topic count badge (cram card count, exam question count). */
  count?: number;
  /** mastered/started ratio; null/undefined = never studied = biggest gap. */
  weakness?: number | null;
};

const STORE_PREFIX = 'revisio-picker:';

/** Lowest-mastery topics first; never-studied (null weakness) ranks weakest.
 *  Topics with a known-zero count (no questions to serve) are skipped. */
export function weakestTopicIds(items: TopicPickerItem[], count = 3): string[] {
  return items
    .filter((t) => t.count === undefined || t.count > 0)
    .map((t) => ({ id: t.id, name: t.name, score: t.weakness ?? -1 }))
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, count)
    .map((t) => t.id);
}

export function loadPickerSelection(key: string, validIds: Set<string>): Set<string> | null {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + key);
    if (!raw) return null;
    const ids = JSON.parse(raw) as unknown;
    if (!Array.isArray(ids)) return null;
    const valid = ids.filter((id): id is string => typeof id === 'string' && validIds.has(id));
    return valid.length > 0 ? new Set(valid) : null;
  } catch {
    return null;
  }
}

export function savePickerSelection(key: string, ids: Iterable<string>) {
  try {
    localStorage.setItem(STORE_PREFIX + key, JSON.stringify([...ids]));
  } catch {
    // Private mode / quota — remembering is best-effort.
  }
}

export function TopicPicker({
  items,
  picked,
  onPick,
  storageKey,
  autoPick = false,
  weakestCount = 3,
  ariaLabel,
}: {
  items: TopicPickerItem[];
  picked: Set<string>;
  onPick: (next: Set<string>) => void;
  /** localStorage key suffix — enables remember + (with autoPick) the default. */
  storageKey?: string;
  /** Pick the remembered selection, else the weakest N, once items arrive. */
  autoPick?: boolean;
  weakestCount?: number;
  ariaLabel?: string;
}) {
  const [query, setQuery] = useState('');
  const autoPicked = useRef(false);

  const validIds = useMemo(() => new Set(items.map((t) => t.id)), [items]);

  useEffect(() => {
    if (!autoPick || autoPicked.current || items.length === 0) return;
    autoPicked.current = true;
    const stored = storageKey ? loadPickerSelection(storageKey, validIds) : null;
    if (stored) {
      onPick(stored);
      return;
    }
    const weakest = weakestTopicIds(items, weakestCount);
    if (weakest.length > 0) onPick(new Set(weakest));
  }, [autoPick, items, validIds, onPick, storageKey, weakestCount]);

  useEffect(() => {
    if (storageKey && items.length > 0) savePickerSelection(storageKey, picked);
  }, [picked, storageKey, items.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            (t.subjectName ?? '').toLowerCase().includes(q) ||
            unitFromTopic(t).toLowerCase().includes(q),
        )
      : items;
    return [...list].sort((a, b) => {
      const s = (a.subjectName ?? '').localeCompare(b.subjectName ?? '');
      if (s !== 0) return s;
      const u = topicSortKey(unitFromTopic(a), unitFromTopic(b));
      if (u !== 0) return u;
      return a.name.localeCompare(b.name);
    });
  }, [items, query]);

  const groups = useMemo(() => {
    const bySubject = new Map<string, Map<string, TopicPickerItem[]>>();
    for (const t of filtered) {
      const subject = t.subjectName ?? 'Other';
      const unit = unitFromTopic(t);
      const units = bySubject.get(subject) ?? new Map<string, TopicPickerItem[]>();
      const list = units.get(unit) ?? [];
      list.push(t);
      units.set(unit, list);
      bySubject.set(subject, units);
    }
    return [...bySubject.entries()].map(([subject, units]) => ({
      subject,
      units: [...units.entries()]
        .map(([unit, list]) => ({ unit, list }))
        .sort((a, b) => topicSortKey(a.unit, b.unit)),
    }));
  }, [filtered]);

  const multiSubject = groups.length > 1;
  const weakest = useMemo(() => weakestTopicIds(items, weakestCount), [items, weakestCount]);
  const showWeakest = items.length > weakestCount && weakest.length > 0;

  const toggle = (id: string) =>
    onPick(
      (() => {
        const next = new Set(picked);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      })(),
    );

  return (
    <div className="space-y-4">
      {items.length > 8 && (
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Icon name="search" size={17} />
          </span>
          <Input
            type="search"
            className="pl-11"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics…"
            aria-label={ariaLabel ? `Search ${ariaLabel}` : 'Search topics'}
          />
        </div>
      )}

      {showWeakest && (
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onPick(new Set(weakest))}
          >
            Pick my weakest {weakestCount}
          </Button>
        </div>
      )}

      {query && filtered.length === 0 && (
        <p className="t-caption text-muted-foreground">
          Nothing matches “{query}”.{' '}
          <button type="button" className="underline underline-offset-4" onClick={() => setQuery('')}>
            clear the search
          </button>
        </p>
      )}

      {groups.map((g) => (
        <div key={g.subject} className="space-y-3">
          {multiSubject && <p className="t-strong">{g.subject}</p>}
          {g.units.map((u) => {
            const showUnit = g.units.length > 1 || u.unit !== 'Other';
            return (
              <div key={u.unit}>
                {showUnit && (
                  <p className="t-fine text-muted-foreground">
                    {u.unit === 'Other' ? 'Other' : `Unit ${u.unit}`}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
                  {u.list.map((t) => {
                    const on = picked.has(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(t.id)}
                        className={`chip transition-colors duration-(--dur-out) ${on ? 'chip-active' : ''}`}
                      >
                        {on && <Icon name="correct" size={13} />}
                        {t.name}
                        {t.count !== undefined && (
                          <span className="text-muted-foreground">{t.count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
