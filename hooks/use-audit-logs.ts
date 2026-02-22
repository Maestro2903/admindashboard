import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

interface AuditLog {
  id: string;
  adminId: string;
  action: string;
  targetCollection: string;
  targetId: string;
  previousData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  ipAddress?: string | null;
  timestamp: string;
}

interface UseAuditLogsResult {
  logs: AuditLog[];
  loading: boolean;
  error: string | null;
}

export function useAuditLogs(user: User | null, authLoading: boolean): UseAuditLogsResult {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const token = await user.getIdToken(false);
        const res = await fetch('/api/admin/logs?limit=100', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json();
        if (!cancelled) setLogs(data.logs ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load logs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, user]);

  return { logs, loading, error };
}
