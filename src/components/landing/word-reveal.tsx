'use client';

import { motion } from 'motion/react';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Reveals a headline one word at a time. The full sentence is kept in an
 * sr-only span so screen readers hear it once, not word by word.
 */
export function WordReveal({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const words = text.split(' ');
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, i) => (
          <span key={`${word}-${i}`} className="inline-block overflow-hidden pb-[0.08em] align-top">
            <motion.span
              className="inline-block"
              initial={{ opacity: 0, y: '0.6em', filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.9, ease: EASE, delay: delay + i * 0.09 }}
            >
              {word}
            </motion.span>
            {i < words.length - 1 ? ' ' : null}
          </span>
        ))}
      </span>
    </span>
  );
}
