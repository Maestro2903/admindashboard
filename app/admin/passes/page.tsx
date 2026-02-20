'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import type { PassManagementRecord, PassManagementResponse, PassStatus } from '@/types/admin';
import { IconDownload, IconSearch, IconChevronLeft, IconChevronRight, IconChevronDown, IconChevronRight as IconChevronR, IconTrash, IconArchive, IconX } from '@tabler/icons-react';
import { formatPhone } from '@/lib/utils';

type SortKey = 'createdAt' | 'usedAt' | 'amount' | 'userName';
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'createdAt', label: 'Date created' },
  { value: 'usedAt', label: 'Date scanned' },
  { value: 'amount', label: 'Amount' },
  { value: 'userName', label: 'Name' },
];

const PASS_TYPES = [
  { value: 'all', label: 'All Pass Types' },
  { value: 'day_pass', label: 'Day Pass' },
  { value: 'group_events', label: 'Group Events' },
  { value: 'proshow', label: 'Proshow' },
  { value: 'sana_concert', label: 'Sana Concert' },
];

const PASS_TYPE_LABELS: Record<string, string> = {
  day_pass: 'Day Pass',
  group_events: 'Group Events',
  proshow: 'Proshow',
  sana_concert: 'Sana Concert',
};

const PAGE_SIZE = 50;

export default function PassExplorerPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = React.useState<PassManagementResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [passType, setPassType] = React.useState('all');
  const [passStatusFilter, setPassStatusFilter] = React.useState<string>('all');
  const [scannedFilter, setScannedFilter] = React.useState<string>('all');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = React.useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');
  const [tablePage, setTablePage] = React.useState(1);

  const fetchData = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();

      const types = passType === 'all'
        ? (['day_pass', 'group_events', 'proshow', 'sana_concert'] as const)
        : ([passType] as const);

      const results: PassManagementResponse[] = [];
      const failedTypes: string[] = [];

      for (const pt of types) {
        try {
          const params = new URLSearchParams();
          params.set('type', pt);
          params.set('page', String(page));
          params.set('pageSize', '100');
          params.set('includeSummary', '1');
          const res = await fetch(`/api/admin/passes?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData?.error ?? `HTTP ${res.status}`);
          }
          const json = (await res.json()) as PassManagementResponse;
          results.push(json);
        } catch (err) {
          failedTypes.push(pt);
          if (passType !== 'all') {
            setError(err instanceof Error ? err.message : `Failed to fetch ${pt}`);
            setData(null);
            return;
          }
        }
      }

      if (results.length === 0) {
        setError(failedTypes.length ? `Failed to fetch: ${failedTypes.join(', ')}` : 'Failed to fetch passes');
        setData(null);
        return;
      }

      const allRecords = results.flatMap((r) => r.records);
      const mergedSummary = results.reduce(
        (acc, r) => ({
          totalSold: acc.totalSold + (r.summary?.totalSold ?? 0),
          totalRevenue: acc.totalRevenue + (r.summary?.totalRevenue ?? 0),
          totalUsed: acc.totalUsed + (r.summary?.totalUsed ?? 0),
          remaining: acc.remaining + (r.summary?.remaining ?? 0),
        }),
        { totalSold: 0, totalRevenue: 0, totalUsed: 0, remaining: 0 }
      );

      setData({
        records: allRecords,
        page,
        pageSize: 100,
        summary: mergedSummary,
      });

      if (failedTypes.length > 0) {
        setError(`Could not load: ${failedTypes.join(', ')}. Other pass types loaded. Check Firestore indexes if this persists.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch passes');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user, passType, page, refreshKey]);

  React.useEffect(() => {
    if (authLoading || !user) return;
    fetchData();
  }, [authLoading, user, fetchData]);

  const handleMarkUsed = React.useCallback(async (passId: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/passes/${passId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'markUsed' }),
      });
      if (!res.ok) throw new Error('Failed to mark pass');
      toast.success('Pass marked as used');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }, [user]);

  const handleRevertUsed = React.useCallback(async (passId: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/passes/${passId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'revertUsed' }),
      });
      if (!res.ok) throw new Error('Failed to revert pass');
      toast.success('Pass reverted to active');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }, [user]);

  const handleExportCsv = React.useCallback(async () => {
    if (!data?.records) return;
    const headers = ['Pass ID', 'User', 'Phone', 'Pass Type', 'Event', 'Amount', 'Status', 'Scanned', 'Created At'];
    const rows = data.records.map((r) => [
      r.passId,
      r.userName,
      r.phone || '',
      r.passStatus === 'paid' ? 'Active' : 'Used',
      r.eventName || '',
      r.amount,
      r.passStatus,
      r.usedAt ? 'Yes' : 'No',
      r.createdAt,
    ]);
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'passes.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }, [data]);

  // Filter and sort records client-side
  const filteredRecords = React.useMemo(() => {
    let recs = data?.records ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      recs = recs.filter((r) =>
        r.userName.toLowerCase().includes(q) ||
        r.passId.toLowerCase().includes(q) ||
        (r.phone?.toLowerCase().includes(q)) ||
        (r.teamName?.toLowerCase().includes(q)) ||
        (r.eventName?.toLowerCase().includes(q))
      );
    }
    if (passStatusFilter !== 'all') {
      recs = recs.filter((r) => r.passStatus === passStatusFilter);
    }
    if (scannedFilter === 'scanned') {
      recs = recs.filter((r) => r.usedAt);
    } else if (scannedFilter === 'not_scanned') {
      recs = recs.filter((r) => !r.usedAt);
    }
    // Sort
    const dir = sortDir === 'asc' ? 1 : -1;
    recs = [...recs].sort((a, b) => {
      let va: string | number | null = null;
      let vb: string | number | null = null;
      if (sortBy === 'createdAt') {
        va = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        vb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      } else if (sortBy === 'usedAt') {
        va = a.usedAt ? new Date(a.usedAt).getTime() : 0;
        vb = b.usedAt ? new Date(b.usedAt).getTime() : 0;
      } else if (sortBy === 'amount') {
        va = a.amount ?? 0;
        vb = b.amount ?? 0;
      } else {
        va = (a.userName ?? '').toLowerCase();
        vb = (b.userName ?? '').toLowerCase();
      }
      if (typeof va === 'number' && typeof vb === 'number') return dir * (va - vb);
      return dir * String(va).localeCompare(String(vb));
    });
    return recs;
  }, [data?.records, search, passStatusFilter, scannedFilter, sortBy, sortDir]);

  // Reset to page 1 when filters or sort change
  React.useEffect(() => {
    setTablePage(1);
  }, [search, passStatusFilter, scannedFilter, sortBy, sortDir, passType]);

  const totalFiltered = filteredRecords.length;
  const totalTablePages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const paginatedRecords = React.useMemo(
    () => filteredRecords.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE),
    [filteredRecords, tablePage]
  );

  const selectedPassIds = React.useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );
  const toggleSelection = React.useCallback((passId: string) => {
    setRowSelection((prev) => ({ ...prev, [passId]: !prev[passId] }));
  }, []);
  const selectAllOnPage = React.useCallback(
    (checked: boolean) => {
      setRowSelection((prev) => {
        const next = { ...prev };
        paginatedRecords.forEach((r) => {
          next[r.passId] = checked;
        });
        return next;
      });
    },
    [paginatedRecords]
  );
  const clearSelection = React.useCallback(() => setRowSelection({}), []);
  const isAllSelected =
    paginatedRecords.length > 0 &&
    paginatedRecords.every((r) => rowSelection[r.passId]);
  const isSomeSelected = paginatedRecords.some((r) => rowSelection[r.passId]);

  const runBulkAction = React.useCallback(
    async (action: 'markUsed' | 'revertUsed' | 'softDelete' | 'delete') => {
      if (!user || selectedPassIds.length === 0) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/bulk-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            action,
            targetCollection: 'passes',
            targetIds: selectedPassIds.slice(0, 100),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? 'Action failed');
        const updated = data?.updated ?? 0;
        toast.success(`${action === 'delete' ? 'Deleted' : action === 'softDelete' ? 'Archived' : 'Updated'} ${updated} pass(es)`);
        setRowSelection({});
        setRefreshKey((k) => k + 1);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Action failed');
      }
    },
    [user, selectedPassIds]
  );

  const summary = data?.summary;
  const usagePercent = summary && summary.totalSold > 0
    ? Math.round((summary.totalUsed / summary.totalSold) * 100)
    : 0;

  const dateFmt = React.useMemo(
    () => new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    []
  );

  const toggleExpanded = (passId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(passId)) next.delete(passId);
      else next.add(passId);
      return next;
    });
  };

  return (
    <div className="space-y-4 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Passes</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Unified pass explorer</p>
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

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Total Sold</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-white">{summary.totalSold}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Revenue</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-white">₹{summary.totalRevenue.toLocaleString('en-IN')}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Used</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-white">{summary.totalUsed}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Usage</div>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-2xl font-semibold tabular-nums text-white">{usagePercent}%</span>
              <span className="text-xs text-zinc-500 mb-1">{summary.remaining} remaining</span>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input
            placeholder="Search by name, ID, phone, or team..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-zinc-700"
          />
        </div>
        <Select value={passType} onValueChange={(v) => { setPassType(v); setPage(1); }}>
          <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-800 text-zinc-300">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-300">
            {PASS_TYPES.map((pt) => (
              <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={passStatusFilter} onValueChange={setPassStatusFilter}>
          <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-800 text-zinc-300">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-300">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="paid">Active</SelectItem>
            <SelectItem value="used">Used</SelectItem>
          </SelectContent>
        </Select>
        <Select value={scannedFilter} onValueChange={setScannedFilter}>
          <SelectTrigger className="w-[160px] bg-zinc-900 border-zinc-800 text-zinc-300">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-300">
            <SelectItem value="all">All Scans</SelectItem>
            <SelectItem value="scanned">Scanned</SelectItem>
            <SelectItem value="not_scanned">Not Scanned</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
          <SelectTrigger className="w-[160px] bg-zinc-900 border-zinc-800 text-zinc-300">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-300">
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        >
          {sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Bulk actions */}
      {selectedPassIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-800/60 px-4 py-3">
          <span className="text-sm text-zinc-300">
            {selectedPassIds.length} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:bg-zinc-700 hover:text-white"
              onClick={() => runBulkAction('markUsed')}
            >
              Mark used
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:bg-zinc-700 hover:text-white"
              onClick={() => runBulkAction('revertUsed')}
            >
              Revert used
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:bg-zinc-700 hover:text-white"
              onClick={() => runBulkAction('softDelete')}
            >
              <IconArchive size={14} className="mr-1" />
              Archive
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
              onClick={() => {
                if (typeof window !== 'undefined' && window.confirm(`Delete ${selectedPassIds.length} pass(es)? This cannot be undone.`)) {
                  runBulkAction('delete');
                }
              }}
            >
              <IconTrash size={14} className="mr-1" />
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:bg-zinc-700 hover:text-white"
              onClick={clearSelection}
            >
              <IconX size={14} className="mr-1" />
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="w-10 px-2 py-3">
                  <Checkbox
                    checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
                    onCheckedChange={(c) => selectAllOnPage(!!c)}
                    aria-label="Select all on page"
                    className="border-zinc-600 data-[state=checked]:bg-zinc-600 data-[state=checked]:border-zinc-600"
                  />
                </th>
                <th className="w-8 px-3 py-3" />
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Pass ID</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">User</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500 w-[140px] min-w-[120px]">Phone</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Pass Type</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Event</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Amount</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Status</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Scanned</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Created</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading && (data?.records?.length ?? 0) === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 12 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-zinc-800" /></td>
                    ))}
                  </tr>
                ))
              ) : totalFiltered === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-sm text-zinc-500">No passes found</td>
                </tr>
              ) : (
                paginatedRecords.map((r) => (
                  <React.Fragment key={r.passId}>
                    <tr className={`hover:bg-zinc-800/50 transition-colors ${rowSelection[r.passId] ? 'bg-zinc-800/60' : ''}`}>
                      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={!!rowSelection[r.passId]}
                          onCheckedChange={() => toggleSelection(r.passId)}
                          aria-label="Select row"
                          className="border-zinc-600 data-[state=checked]:bg-zinc-600 data-[state=checked]:border-zinc-600"
                        />
                      </td>
                      <td className="px-3 py-3">
                        {r.team && (
                          <button onClick={() => toggleExpanded(r.passId)} className="text-zinc-500 hover:text-zinc-300">
                            {expandedRows.has(r.passId) ? <IconChevronDown size={16} /> : <IconChevronR size={16} />}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-zinc-400">{r.passId.slice(0, 8)}...</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-white">{r.userName}</div>
                        <div className="text-xs text-zinc-500">{r.college}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-300 tabular-nums whitespace-nowrap w-[140px] min-w-[120px]">{formatPhone(r.phone)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-300">
                          {PASS_TYPE_LABELS[r.passId] ?? r.passId.includes('day') ? 'Day Pass' : r.teamName ? 'Group' : 'Pass'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-300 max-w-[180px] truncate" title={r.eventName || undefined}>
                        {r.eventName || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">₹{r.amount}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                          r.passStatus === 'used'
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-emerald-500/10 text-emerald-400'
                        }`}>
                          {r.passStatus === 'used' ? 'Used' : 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-400">
                        {r.usedAt ? dateFmt.format(new Date(r.usedAt)) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-zinc-400 whitespace-nowrap">
                        {r.createdAt ? dateFmt.format(new Date(r.createdAt)) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {r.passStatus === 'paid' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
                            onClick={() => handleMarkUsed(r.passId)}
                          >
                            Mark Used
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
                            onClick={() => handleRevertUsed(r.passId)}
                          >
                            Revert
                          </Button>
                        )}
                      </td>
                    </tr>
                    {/* Expanded team members */}
                    {expandedRows.has(r.passId) && r.team && (
                      <tr>
                        <td colSpan={12} className="bg-zinc-950 px-8 py-4">
                          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-2">
                            Team: {r.team.teamName} · {r.team.totalMembers} members
                          </div>
                          <div className="space-y-1">
                            {r.team.members.map((m, i) => (
                              <div key={i} className="flex items-center gap-4 rounded-lg bg-zinc-900 px-3 py-2 text-sm">
                                <span className={`h-2 w-2 rounded-full ${m.checkedIn ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                                <span className="text-zinc-300 min-w-[150px]">{m.name}</span>
                                <span className="text-zinc-500 tabular-nums">{formatPhone(m.phone)}</span>
                                {m.isLeader && <span className="text-[10px] uppercase tracking-wider text-amber-500">Leader</span>}
                                {m.checkedIn && m.checkInTime && (
                                  <span className="text-xs text-zinc-500 ml-auto tabular-nums">{m.checkInTime}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 bg-zinc-950 px-4 py-3">
          <span className="text-xs text-zinc-500">
            {totalFiltered === 0
              ? '0 passes'
              : `Showing ${(tablePage - 1) * PAGE_SIZE + 1}-${Math.min(tablePage * PAGE_SIZE, totalFiltered)} of ${totalFiltered}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={tablePage <= 1}
              onClick={() => setTablePage((p) => p - 1)}
              className="rounded-md bg-zinc-800 px-3 py-1 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
            >
              <IconChevronLeft size={16} />
            </Button>
            <span className="text-xs tabular-nums text-zinc-500">
              Page {tablePage} of {totalTablePages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={tablePage >= totalTablePages}
              onClick={() => setTablePage((p) => p + 1)}
              className="rounded-md bg-zinc-800 px-3 py-1 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
            >
              <IconChevronRight size={16} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
