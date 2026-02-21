'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { UnifiedTable, type UnifiedTableFilters } from '@/components/admin/UnifiedTable';
import { BulkActionBar } from '@/components/admin/BulkActionBar';
import { RowDetailModal, type TeamMemberRow } from '@/components/admin/RowDetailModal';
import { Button } from '@/components/ui/button';
import type { AdminEvent, CleanUnifiedRecordWithId, UnifiedDashboardResponse } from '@/types/admin';

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

export function UnifiedViewClient() {
  const { user, loading: authLoading } = useAuth();

  const [events, setEvents] = React.useState<AdminEvent[]>([]);
  const [data, setData] = React.useState<UnifiedDashboardResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const searchParams = useSearchParams();
  const [filters, setFilters] = React.useState<UnifiedTableFilters>(() => {
    const q = searchParams.get('q') ?? '';
    const passType = searchParams.get('passType') ?? undefined;
    const eventId = searchParams.get('eventId') ?? undefined;
    const from = searchParams.get('from') ?? undefined;
    const to = searchParams.get('to') ?? undefined;
    return { q, passType, eventId, from, to };
  });

  const [cursorStack, setCursorStack] = React.useState<string[]>([]);
  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({});
  const [detailRecord, setDetailRecord] = React.useState<CleanUnifiedRecordWithId | null>(null);
  const [teamMembers, setTeamMembers] = React.useState<TeamMemberRow[] | null>(null);
  const [loadingTeam, setLoadingTeam] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const records = data?.records ?? [];
  const selectedPassIds = React.useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );
  const selectedRecords = React.useMemo(
    () => records.filter((r) => rowSelection[r.passId]),
    [records, rowSelection]
  );
  const handleRowSelectionChange = React.useCallback(
    (updater: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => {
      setRowSelection(typeof updater === 'function' ? updater(rowSelection) : updater);
    },
    [rowSelection]
  );

  React.useEffect(() => {
    const q = searchParams.get('q') ?? '';
    const passType = searchParams.get('passType') ?? undefined;
    const eventId = searchParams.get('eventId') ?? undefined;
    const from = searchParams.get('from') ?? undefined;
    const to = searchParams.get('to') ?? undefined;
    setFilters((prev) =>
      prev.q !== q || prev.passType !== passType || prev.eventId !== eventId || prev.from !== from || prev.to !== to
        ? { q, passType, eventId, from, to }
        : prev
    );
  }, [searchParams]);

  React.useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const resp = await fetchJson<{ events: AdminEvent[] }>(
          '/api/admin/events?activeOnly=1',
          token
        );
        if (!cancelled) setEvents(resp.events || []);
      } catch (e) {
        if (!cancelled) console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const cursor = cursorStack.length ? cursorStack[cursorStack.length - 1] : null;

  const queryString = React.useMemo(() => {
    const params = new URLSearchParams();
    params.set('pageSize', '50');
    if (cursor) params.set('cursor', cursor);
    if (filters.q?.trim()) params.set('q', filters.q.trim());
    if (filters.passType) params.set('passType', filters.passType);
    if (filters.eventId) params.set('eventId', filters.eventId);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    return params.toString();
  }, [cursor, filters]);

  React.useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      (async () => {
        try {
          setLoading(true);
          setError(null);
          const token = await user.getIdToken();
          const resp = await fetchJson<UnifiedDashboardResponse>(
            `/api/admin/unified-dashboard?${queryString}`,
            token
          );
          if (!cancelled) setData(resp);
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [authLoading, user, queryString, refreshKey]);

  React.useEffect(() => {
    setTeamMembers(null);
  }, [detailRecord]);

  const canPrev = cursorStack.length > 0;

  const handleExportCsv = React.useCallback(async () => {
    if (!user) return;
    try {
      const params = new URLSearchParams();
      params.set('pageSize', '1000');
      params.set('format', 'csv');
      if (filters.q?.trim()) params.set('q', filters.q.trim());
      if (filters.passType) params.set('passType', filters.passType);
      if (filters.eventId) params.set('eventId', filters.eventId);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/unified-dashboard?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'unified-view.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error(e);
    }
  }, [user, filters]);

  return (
    <div className="w-full space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Unified View</h1>
          <p className="text-sm text-zinc-500">
            Pass type → events → users (operational view, no amounts)
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
          onClick={handleExportCsv}
        >
          Export CSV
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="text-sm font-medium text-red-400">Failed to load unified dashboard</div>
          <div className="mt-1 text-sm text-red-400/70">{error}</div>
        </div>
      ) : null}

      <UnifiedTable
        data={records}
        events={events}
        filters={filters}
        onFiltersChange={(next) => {
          setFilters(next);
          setCursorStack([]);
        }}
        loading={loading}
        nextCursor={data?.nextCursor ?? null}
        canPrev={canPrev}
        onNextPage={() => {
          const next = data?.nextCursor;
          if (!next) return;
          setCursorStack((s) => [...s, next]);
        }}
        onPrevPage={() => {
          setCursorStack((s) => s.slice(0, -1));
        }}
        onRowClick={(record) => setDetailRecord(record)}
        rowSelection={rowSelection}
        onRowSelectionChange={handleRowSelectionChange}
      />
      <BulkActionBar
        selectedCount={selectedPassIds.length}
        selectedPassIds={selectedPassIds}
        selectedRecords={selectedRecords}
        onClearSelection={() => setRowSelection({})}
        onSuccess={() => setRefreshKey((k) => k + 1)}
        getToken={async () => (user ? user.getIdToken() : '')}
      />
      <RowDetailModal
        record={detailRecord}
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        onUpdated={() => {
          setDetailRecord(null);
          setRefreshKey((k) => k + 1);
        }}
        teamMembers={teamMembers ?? undefined}
        loadingTeam={loadingTeam}
        getToken={async () => (user ? user.getIdToken() : '')}
      />
    </div>
  );
}
