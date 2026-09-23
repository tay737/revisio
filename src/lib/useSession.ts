'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken, type SessionUser } from '@/lib/api';

export function useSession() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<SessionUser>('/api/v1/me');
        if (!cancelled) setUser(data);
      } catch {
        if (!cancelled) setUser(null);
        router.replace('/login');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const logout = async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } catch {
      /* ignore */
    }
    setToken(null);
    router.replace('/login');
  };

  return { user, loading, logout };
}
