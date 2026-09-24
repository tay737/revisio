'use client';

import { useCallback, useRef } from 'react';
import { Confetti, type ConfettiHandle } from '@/components/ui/motion/confetti';

/**
 * Celebration, in one line.
 *
 * Both the review loop and the exam result need "a correct answer flickers some
 * confetti", and both were about to hand-wire a ref, a callback and a canvas.
 * This hook owns that pairing so each surface just calls `celebrate()` and
 * renders `<CanvasConfetti ref={ref} />`.
 */
export function useCelebration() {
  const ref = useRef<ConfettiHandle>(null);

  const celebrate = useCallback((opts?: { origin?: { x: number; y: number }; count?: number }) => {
    ref.current?.fire(opts);
  }, []);

  return { ref, celebrate };
}

export { Confetti as CanvasConfetti };
