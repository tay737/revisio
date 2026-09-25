'use client';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cn } from '@/lib/utils';

/**
 * Tabs.
 *
 * Two things were wrong with the generated version of this file and both were
 * real bugs rather than taste:
 *
 *   1. **It laid out as a row, not a column.** The root carried
 *      `data-horizontal:flex-col`, but Base UI emits `data-orientation="horizontal"`
 *      — the variant never matched, so the panel sat *beside* the tab list. A
 *      panel containing a horizontally scrolling rail then stretched the page to
 *      1891px on a 390px phone. Orientation is now expressed with the attribute
 *      that exists.
 *   2. **It imported the styling vocabulary of a different design system**
 *      (`bg-muted` tracks, `rounded-4xl` thumbs, `text-foreground/60` labels).
 *      It now wears this app's: a pill track in `--secondary`, a pill thumb in
 *      `--card`, and a selected label in ink.
 *
 * `data-active` is emitted by Base UI on the selected tab, so the active state
 * is one attribute selector rather than a second piece of state.
 */
function Tabs({ className, orientation = 'horizontal', ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        'flex flex-col gap-3 data-[orientation=vertical]:flex-row data-[orientation=vertical]:gap-5',
        className,
      )}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1 rounded-pill bg-secondary p-1',
        'data-[orientation=vertical]:w-full data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch',
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-pill px-4 text-[14px] font-semibold whitespace-nowrap',
        'text-muted-foreground transition-colors duration-150 hover:text-foreground',
        'data-active:bg-card data-active:text-foreground',
        'data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start',
        'focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn('min-w-0 flex-1 outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
