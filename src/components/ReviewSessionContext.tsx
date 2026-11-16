'use client';

import { createContext, useContext, useMemo, useState } from 'react';

const ReviewSessionContext = createContext<{
  active: boolean;
  /** Focus mode: while a card is on screen, the shell's chrome steps back. */
  focus: boolean;
  setActive: (active: boolean) => void;
  setFocus: (focus: boolean) => void;
} | null>(null);

export function ReviewSessionProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [focus, setFocus] = useState(false);
  const value = useMemo(() => ({ active, focus, setActive, setFocus }), [active, focus]);
  return <ReviewSessionContext.Provider value={value}>{children}</ReviewSessionContext.Provider>;
}

export function useReviewSession() {
  const context = useContext(ReviewSessionContext);
  if (!context) throw new Error('useReviewSession must be used inside ReviewSessionProvider');
  return context;
}
