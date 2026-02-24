import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

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
    if (!user) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const token = await user.getIdToken(false);
        const combined: UserRecord[] = [];
        let cursor: string | null = null;

        // Walk pages sequentially to avoid a single full collection scan.
        // Safety cap to prevent runaway loops in pathological cases.
        const MAX_PAGES = 20;
        const PAGE_SIZE = 500;

        for (let i = 0; i < MAX_PAGES; i += 1) {
          const params = new URLSearchParams();
          params.set('pageSize', String(PAGE_SIZE));
          if (cursor) params.set('cursor', cursor);

          const res = await fetch(`/api/users?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`Failed: ${res.status}`);
          const data: { users?: UserRecord[]; nextCursor?: string | null } = await res.json();

          if (data.users && data.users.length > 0) {
            combined.push(...data.users);
          }

          cursor = data.nextCursor ?? null;
          if (!cursor) break;
        }

        if (!controller.signal.aborted) {
          setUsers(combined);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [user, version]);

  const refetch = () => setVersion((v) => v + 1);

  return { users, loading, error, refetch };
}
