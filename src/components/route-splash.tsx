'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Splash } from '@/components/ui/splash';

// Shows the splash during App Router navigation transitions. We can't hook
// the router's internal loading state pre-Next 15, so: navigation start via
// link clicks is unreliable — instead we show the splash briefly on every
// pathname change (blur in the new page beneath it). Sessions stay snappy
// because the splash exits as soon as the page paints.

export function RouteSplash() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [first, setFirst] = useState(true);

  useEffect(() => {
    if (first) {
      setFirst(false);
      return;
    }
    setShow(true);
    const t = setTimeout(() => setShow(false), 450);
    return () => clearTimeout(t);
  }, [pathname, first]);

  return <Splash show={show} />;
}
