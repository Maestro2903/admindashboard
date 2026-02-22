'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { FinancialTable } from '@/components/admin/FinancialTable';
import { BulkActionBar } from '@/components/admin/BulkActionBar';
import { RowDetailModal } from '@/components/admin/RowDetailModal';
import { Button } from '@/components/ui/button';
import type { AdminEvent, FinancialRecord, FinancialDashboardResponse } from '@/types/admin';
import type { UnifiedTableFilters } from '@/components/admin/UnifiedTable';
import { IconDownload } from '@tabler/icons-react';

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

function FinancialViewClientInner() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();

  const [events, setEvents] = React.useState<AdminEvent[]>([]);
  const [data, setData] = React.useState<FinancialDashboardResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [filters, setFilters] = React.useState<UnifiedTableFilters>(() => ({
    q: searchParams.get('q') ?? '',
    passType: searchParams.get('passType') ?? undefined,
    eventId: searchParams.get('eventId') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  }));

  const [cursorStack, setCursorStack] = React.useState<string[]>([]);
  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({});
  const [detailRecord, setDetailRecord] = React.useState<FinancialRecord | null>(null);
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

  // Fetch events
  React.useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken(false);
        const resp = await fetchJson<{ events: AdminEvent[] }>('/api/admin/events?activeOnly=1', token);
        if (!cancelled) setEvents(resp.events || []);
      } catch (e) {
        if (!cancelled) console.error(e);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, user]);

  const cursor = cursorStack.length ? cursorStack[cursorStack.length - 1] : null;

  const queryString = React.useMemo(() => {
    const params = new URLSearchParams();
    params.set('mode', 'financial');
    params.set('pageSize', '50');
    if (cursor) params.set('cursor', cursor);
    if (filters.q?.trim()) params.set('q', filters.q.trim());
    if (filters.passType) params.set('passType', filters.passType);
    if (filters.eventId) params.set('eventId', filters.eventId);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    return params.toString();
  }, [cursor, filters]);

  // Fetch data
  React.useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      (async () => {
        try {
          setLoading(true);
          setError(null);
          const token = await user.getIdToken(false);
          const resp = await fetchJson<FinancialDashboardResponse>(
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
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [authLoading, user, queryString, refreshKey]);

  const canPrev = cursorStack.length > 0;

  const handleExportCsv = React.useCallback(async () => {
    if (!user) return;
    try {
      const params = new URLSearchParams();
      params.set('mode', 'financial');
      params.set('pageSize', '1000');
      params.set('format', 'csv');
      if (filters.q?.trim()) params.set('q', filters.q.trim());
      if (filters.passType) params.set('passType', filters.passType);
      if (filters.eventId) params.set('eventId', filters.eventId);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const token = await user.getIdToken(false);
      const res = await fetch(`/api/admin/unified-dashboard?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'financial-report.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error(e);
    }
  }, [user, filters]);

  const totalRevenue = React.useMemo(
    () =>
      typeof data?.summary?.totalRevenue === 'number'
        ? data.summary.totalRevenue
        : records.reduce((sum, r) => sum + (r.amount || 0), 0),
    [data?.summary?.totalRevenue, records]
  );

  return (
    <div className="min-w-0 w-full space-y-3 opacity-0 animate-[fadeIn_0.2s_ease-out_forwards]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Financial View</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Superadmin only - Full financial data</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-right">
            <div className="text-xs uppercase text-zinc-500">Revenue</div>
            <div className="text-xl font-semibold tabular-nums text-emerald-400">
              ₹{Number.isFinite(totalRevenue) ? totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '0'}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            onClick={handleExportCsv}
          >
            <IconDownload size={16} className="mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm font-medium text-red-400">Failed to load financial data</p>
          <p className="mt-1 text-sm text-red-400/70">{error}</p>
        </div>
      )}

      <FinancialTable
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
          if (next) setCursorStack((s) => [...s, next]);
        }}
        onPrevPage={() => setCursorStack((s) => s.slice(0, -1))}
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
        getToken={async () => (user ? user.getIdToken(false) : '')}
        financialMode
      />

      <RowDetailModal
        record={detailRecord}
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        onUpdated={() => {
          setDetailRecord(null);
          setRefreshKey((k) => k + 1);
        }}
        getToken={async () => (user ? user.getIdToken(false) : '')}
      />
    </div>
  );
}

export function FinancialViewClient() {
  return (
    <Suspense fallback={<Skeleton className="h-24 w-full" />}>
      <FinancialViewClientInner />
    </Suspense>
  );
}
