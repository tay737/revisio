'use client';

import { useEffect, useState } from 'react';
import { getHeroVariant, type HeroVariant } from '@/lib/hero-test';

/**
 * The landing hero H1, A/B-tested (#23).
 *
 * SSR always renders the control line — it is the audit-approved default and
 * the SEO-safe text. After hydration the assigned variant swaps in; visitors
 * bucketed into a challenger see one text change in place, same classes, no
 * layout shift beyond the heading's own wrap. The variant label rides on
 * `cta_click` / signup funnel events via lib/hero-test.
 */
const HEADLINES: Record<HeroVariant, string> = {
  control: 'Spaced repetition for GCSE, A-level and university.',
  outcome: 'Revise for GCSEs in ten minutes a day.',
  wedge: 'The revision queue that builds itself.',
};

export function HeroH1() {
  const [text, setText] = useState(HEADLINES.control);

  useEffect(() => {
    const variant = getHeroVariant();
    if (variant !== 'control') setText(HEADLINES[variant]);
  }, []);

  return <h1 className="t-hero max-w-[21ch]">{text}</h1>;
}
