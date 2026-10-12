'use client';

import { createContext, useContext, useMemo, useState } from 'react';

const ReviewSessionContext = createContext<{
  active: boolean;
  setActive: (active: boolean) => void;
} | null>(null);

export function ReviewSessionProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const value = useMemo(() => ({ active, setActive }), [active]);
  return <ReviewSessionContext.Provider value={value}>{children}</ReviewSessionContext.Provider>;
}

export function useReviewSession() {
  const context = useContext(ReviewSessionContext);
  if (!context) throw new Error('useReviewSession must be used inside ReviewSessionProvider');
  return context;
}
