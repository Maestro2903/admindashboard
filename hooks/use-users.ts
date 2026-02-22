import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { getCache, setCache, invalidateCache } from '@/lib/clientCache';

const CACHE_KEY = 'users';

interface UserRecord {
  id: string;
  name: string | null;
  email: string | null;
  college: string | null;
  phone: string | null;
  isOrganizer: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  referralCode: string | null;
  inviteCount: number;
  dayPassUnlocked: boolean;
  isArchived?: boolean;
}

interface UseUsersResult {
  users: UserRecord[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useUsers(user: User | null): UseUsersResult {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const controller = new AbortController();
    (async () => {
      try {
        setLoading(true);
        const token = await user.getIdToken(false);
        const res = await fetch('/api/users', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json();
        setUsers(data.users || []);
        setError(null);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [user, version]);

  const refetch = () => setVersion((v) => v + 1);

  return { users, loading, error, refetch };
}
