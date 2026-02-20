'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { EventDashboard, type EventDashboardData } from '@/components/admin/EventDashboard';
import type { CleanUnifiedRecordWithId, UnifiedDashboardResponse } from '@/types/admin';

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export default function EventDashboardPage() {
  const params = useParams();
  const eventId = typeof params?.eventId === 'string' ? params.eventId : '';
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = React.useState<EventDashboardData | null>(null);
  const [records, setRecords] = React.useState<CleanUnifiedRecordWithId[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [quickFilter, setQuickFilter] = React.useState<
    'all' | 'not_checked_in' | 'teams_incomplete'
  >('all');

  React.useEffect(() => {
    if (authLoading || !user || !eventId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const token = await user.getIdToken();
        const [eventRes, unifiedRes] = await Promise.all([
          fetchJson<{ event: EventDashboardData['event']; metrics: EventDashboardData['metrics'] }>(
            `/api/admin/events/${eventId}`,
            token
          ),
          fetchJson<UnifiedDashboardResponse>(
            `/api/admin/unified-dashboard?eventId=${encodeURIComponent(eventId)}&pageSize=500`,
            token
          ),
        ]);
        if (!cancelled) {
          setData({
            event: eventRes.event,
            metrics: eventRes.metrics,
          });
          setRecords(unifiedRes.records ?? []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, eventId]);

  const handleExport = React.useCallback(async () => {
    if (!user || !eventId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/events/${eventId}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const name = res.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] ?? 'event-registrations.csv';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error(e);
    }
  }, [user, eventId]);

  return (
    <div className="admin-panel">
      <EventDashboard
        data={data}
        records={records}
        loading={loading}
        error={error}
        quickFilter={quickFilter}
        onQuickFilterChange={setQuickFilter}
        onExport={handleExport}
      />
    </div>
  );
}
