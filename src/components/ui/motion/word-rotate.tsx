'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DUR, EASE } from '@/lib/motion';

/**
 * Magic UI's WordRotate.
 *
 * Used for the dashboard's conversation starters, so the greeting keeps
 * offering the next useful thing to say instead of restating one sentence.
 *
 * One hidden span acts as a measuring stick: we measure each phrase once and
 * pin the container width to the widest, so swapping never reflows the copy
 * around it. That reflow was the reason this kind of ticker usually feels
 * jittery.
 */
export function WordRotate({
  words,
  interval = 3200,
  className,
}: {
  words: string[];
  interval?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState<number | undefined>(undefined);
  const ruler = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (words.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [words, interval]);

  useLayoutEffect(() => {
    const el = ruler.current;
    if (!el || words.length === 0) return;
    let widest = 0;
    let longest = words[0];
    for (const word of words) {
      el.textContent = word;
      widest = Math.max(widest, el.getBoundingClientRect().width);
      if (word.length > longest.length) longest = word;
    }
    // Leave the longest phrase in the ruler rather than clearing it: an empty
    // inline produces no line box, which collapsed the container to zero height
    // and let `overflow-hidden` clip the visible word away entirely.
    el.textContent = longest;
    if (widest > 0) setWidth(Math.ceil(widest));
  }, [words]);

  if (words.length === 0) return null;

  return (
    <span className={cn('relative inline-block overflow-hidden', className)} style={{ width }}>
      <span ref={ruler} aria-hidden className="invisible whitespace-nowrap" />
      <span className="absolute inset-0 flex items-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={words[index]}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: DUR.base, ease: EASE.out }}
            className="whitespace-nowrap"
          >
            {words[index]}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}
