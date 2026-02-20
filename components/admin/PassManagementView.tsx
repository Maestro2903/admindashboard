'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PassTable } from '@/components/admin/PassTable';
import { PassFilters } from '@/components/admin/PassFilters';
import { ExportButtons } from '@/components/admin/ExportButtons';
import type {
  PassManagementRecord,
  PassManagementResponse,
  PassManagementType,
  PassFiltersState,
} from '@/types/admin';

const PAGE_SIZE = 50;

function applyFilters(
  records: PassManagementRecord[],
  filters: PassFiltersState,
  searchQuery: string,
  isGroupEvents: boolean
): PassManagementRecord[] {
  let out = records;

  const q = searchQuery.trim().toLowerCase();
  if (q) {
    out = out.filter((r) => {
      const hay = [
        r.userName,
        r.college,
        r.phone,
        r.passId,
        ...(isGroupEvents ? [r.teamName ?? ''] : []),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  if (filters.passStatus && filters.passStatus !== 'all') {
    out = out.filter((r) => r.passStatus === filters.passStatus);
  }
  if (filters.scanned === 'scanned') {
    out = out.filter((r) => r.scannedBy != null && r.scannedBy !== '');
  }
  if (filters.scanned === 'not_scanned') {
    out = out.filter((r) => r.scannedBy == null || r.scannedBy === '');
  }
  if (filters.amountMin != null) {
    out = out.filter((r) => r.amount >= filters.amountMin!);
  }
  if (filters.amountMax != null) {
    out = out.filter((r) => r.amount <= filters.amountMax!);
  }
  if (isGroupEvents) {
    if (filters.teamSizeMin != null) {
      out = out.filter((r) => (r.totalMembers ?? 0) >= filters.teamSizeMin!);
    }
    if (filters.teamSizeMax != null) {
      out = out.filter((r) => (r.totalMembers ?? 0) <= filters.teamSizeMax!);
    }
    if (filters.checkedInMin != null) {
      out = out.filter((r) => (r.checkedInCount ?? 0) >= filters.checkedInMin!);
    }
    if (filters.checkedInMax != null) {
      out = out.filter((r) => (r.checkedInCount ?? 0) <= filters.checkedInMax!);
    }
  }
  if (filters.from) {
    out = out.filter((r) => r.createdAt >= filters.from!);
  }
  if (filters.to) {
    const toEnd = filters.to + 'T23:59:59.999Z';
    out = out.filter((r) => r.createdAt <= toEnd);
  }

  return out;
}

export function PassManagementView({
  type,
  title,
}: {
  type: PassManagementType;
  title: string;
}) {
  const { user, loading: authLoading } = useAuth();
  const [mounted, setMounted] = React.useState(false);
  const [data, setData] = React.useState<PassManagementResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [filters, setFilters] = React.useState<PassFiltersState>({});
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const queryString = React.useMemo(() => {
    const params = new URLSearchParams();
    params.set('type', type);
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    if (page === 1) params.set('includeSummary', '1');
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    return params.toString();
  }, [type, page, filters.from, filters.to]);

  React.useEffect(() => {
    if (authLoading || !user || !mounted) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/passes?${queryString}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? `Request failed (${res.status})`);
        }
        const json = (await res.json()) as PassManagementResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, queryString, mounted]);

  const records = data?.records ?? [];
  const isGroupEvents = type === 'group_events';
  const filteredRecords = React.useMemo(
    () => applyFilters(records, filters, debouncedSearch, isGroupEvents),
    [records, filters, debouncedSearch, isGroupEvents]
  );

  const summary = data?.summary;
  const canPrev = page > 1;
  const canNext = records.length === PAGE_SIZE;

  return (
    <div className="min-h-screen w-full bg-zinc-950 px-4 py-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">{title}</h1>
            <p className="mt-1 text-sm text-zinc-500">Success payments only • Flat table</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search name, college, phone, pass ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border-zinc-600 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 sm:w-64"
            />
            <ExportButtons
              records={filteredRecords}
              passType={type}
              title={title}
            />
          </div>
        </div>

        {summary && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
              <p className="text-xs font-medium text-zinc-500">Total Sold</p>
              <p className="text-xl font-semibold text-zinc-100">{summary.totalSold}</p>
            </div>
            <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
              <p className="text-xs font-medium text-zinc-500">Revenue</p>
              <p className="text-xl font-semibold text-zinc-100">
                ₹{summary.totalRevenue.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
              <p className="text-xs font-medium text-zinc-500">Used</p>
              <p className="text-xl font-semibold text-zinc-100">{summary.totalUsed}</p>
            </div>
            <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
              <p className="text-xs font-medium text-zinc-500">Remaining</p>
              <p className="text-xl font-semibold text-zinc-100">{summary.remaining}</p>
            </div>
            {isGroupEvents && summary.totalTeams != null && (
              <>
                <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
                  <p className="text-xs font-medium text-zinc-500">Total Teams</p>
                  <p className="text-xl font-semibold text-zinc-100">{summary.totalTeams}</p>
                </div>
                <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
                  <p className="text-xs font-medium text-zinc-500">Participants</p>
                  <p className="text-xl font-semibold text-zinc-100">
                    {summary.totalParticipants ?? '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
                  <p className="text-xs font-medium text-zinc-500">Checked-In</p>
                  <p className="text-xl font-semibold text-zinc-100">
                    {summary.checkedInCount ?? '—'}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-4">
            <p className="text-sm font-medium text-red-400">Failed to load</p>
            <p className="mt-1 text-sm text-red-300">{error}</p>
          </div>
        )}

        {mounted && (
          <>
            <PassFilters
              filters={filters}
              onFiltersChange={setFilters}
              isGroupEvents={isGroupEvents}
            />
            <PassTable
              data={filteredRecords}
              loading={loading}
              isGroupEvents={isGroupEvents}
            />
            <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
              <span className="text-sm text-zinc-500">
                {loading ? 'Loading…' : `${filteredRecords.length} rows (this page)`}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                  disabled={!canPrev || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                  disabled={!canNext || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
