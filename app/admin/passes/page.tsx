'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type { AdminPassRow, AdminPassesResponse, PassType } from '@/types/admin';
import { IconDownload, IconSearch, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

type PassFilterType = PassType | 'all';

const PASS_TYPES: { value: PassFilterType; label: string }[] = [
  { value: 'all', label: 'All Passes' },
  { value: 'day_pass', label: 'Day Pass' },
  { value: 'group_events', label: 'Group Events' },
  { value: 'proshow', label: 'Proshow' },
  { value: 'sana_concert', label: 'Sana Concert' },
];

const PASS_TYPE_LABELS: Record<PassType, string> = {
  day_pass: 'Day Pass',
  group_events: 'Group Events',
  proshow: 'Proshow',
  sana_concert: 'Sana Concert',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatPhone(phone: string): string {
  if (!phone) return '—';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) return `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  return phone;
}

export default function PassesPage() {
  const { user, userData, loading: authLoading } = useAuth();
  const adminRole = (userData?.adminRole as string | undefined) ?? 'viewer';
  const isSuperAdmin = adminRole === 'superadmin';
  const canSeeAmount = adminRole === 'manager' || adminRole === 'superadmin';

  const [data, setData] = React.useState<AdminPassesResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [passType, setPassType] = React.useState<PassFilterType>('day_pass');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [eventFilter, setEventFilter] = React.useState<string>('all');

  const fetchData = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken(false);
      const params = new URLSearchParams({ page: String(page), pageSize: '50' });
      if (passType && passType !== 'all') {
        params.set('type', passType);
      } else {
        params.set('type', 'all');
      }
      console.log('[PASSES] Fetching:', `/api/admin/passes?${params}`);
      const res = await fetch(`/api/admin/passes?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('[PASSES] Response status:', res.status);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('[PASSES] Error response:', errData);
        throw new Error(errData?.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as AdminPassesResponse;
      console.log('[PASSES] Data received:', json);
      setData(json);
    } catch (err) {
      console.error('[PASSES] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch passes');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user, passType, page]);

  React.useEffect(() => {
    if (authLoading || !user) return;
    fetchData();
  }, [authLoading, user, fetchData]);

  const handleExportCsv = React.useCallback(() => {
    if (!data?.data) return;
    const headers = canSeeAmount
      ? ['Pass ID', 'User', 'Phone', 'College', 'Type', 'Event', 'Day', 'Amount', 'Used', 'Created']
      : ['Pass ID', 'User', 'Phone', 'College', 'Type', 'Event', 'Day', 'Used', 'Created'];
    const rows = data.data.map((r) =>
      canSeeAmount
        ? [r.id, r.name, r.phone || '', r.college || '', PASS_TYPE_LABELS[r.passType as PassType] || r.passType, r.eventLabel || '', r.selectedDay || '', r.amount, r.isUsed ? 'Yes' : 'No', r.createdAt]
        : [r.id, r.name, r.phone || '', r.college || '', PASS_TYPE_LABELS[r.passType as PassType] || r.passType, r.eventLabel || '', r.selectedDay || '', r.isUsed ? 'Yes' : 'No', r.createdAt]
    );
    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `passes-${passType}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [data, passType, canSeeAmount]);

  const filteredData = React.useMemo(() => {
    if (!data?.data) return [];
    const q = search.toLowerCase().trim();
    return data.data.filter((r) => {
      const matchesSearch =
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.phone?.toLowerCase().includes(q) ||
        r.college?.toLowerCase().includes(q) ||
        r.eventLabel?.toLowerCase().includes(q);

      const matchesEvent =
        eventFilter === 'all' ||
        (eventFilter === 'none'
          ? !r.eventLabel
          : r.eventLabel === eventFilter);

      return matchesSearch && matchesEvent;
    });
  }, [data, search, eventFilter]);

  const eventOptions = React.useMemo(() => {
    if (!data?.data) return [];
    const set = new Set<string>();
    for (const row of data.data) {
      if (row.eventLabel) set.add(row.eventLabel);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const summary = data?.summary;
  const pagination = data?.pagination;

  return (
    <div className="space-y-4 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Passes</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Manage event passes</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
          onClick={handleExportCsv}
          disabled={!data?.data?.length}
        >
          <IconDownload size={16} className="mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Summary Cards — Super Admin only */}
      {isSuperAdmin && summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Total Sold</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-white">{summary.totalSold}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Revenue</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-white">
              ₹{summary.totalRevenue.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Used</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-white">{summary.totalUsed}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Usage</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-white">{summary.usagePercentage}%</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input
            placeholder="Search by name, ID, phone, college..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-zinc-700"
          />
        </div>
        <Select
          value={passType}
          onValueChange={(v) => {
            setPassType(v as PassFilterType);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px] bg-zinc-900 border-zinc-800 text-zinc-300">
            <SelectValue placeholder="Pass type" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-300">
            {PASS_TYPES.map((pt) => (
              <SelectItem key={pt.value} value={pt.value}>
                {pt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={eventFilter}
          onValueChange={(v) => {
            setEventFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[200px] bg-zinc-900 border-zinc-800 text-zinc-300">
            <SelectValue placeholder="All events" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-300">
            <SelectItem value="all">All events</SelectItem>
            <SelectItem value="none">No event / pass-only</SelectItem>
            {eventOptions.map((label) => (
              <SelectItem key={label} value={label}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  Pass ID
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  User
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  Phone
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  College
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  Event
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  Day
                </th>
                {canSeeAmount && (
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                    Amount
                  </th>
                )}
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  Used
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading && !data ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: canSeeAmount ? 10 : 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 w-20 animate-pulse rounded bg-zinc-800" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={canSeeAmount ? 10 : 9} className="px-4 py-12 text-center text-sm text-zinc-500">
                    No passes found
                  </td>
                </tr>
              ) : (
                filteredData.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-800/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono text-zinc-400">{r.id.slice(0, 8)}...</td>
                    <td className="px-4 py-3 text-sm text-white">{r.name}</td>
                    <td className="px-4 py-3 text-sm text-zinc-300 tabular-nums">{formatPhone(r.phone)}</td>
                    <td className="px-4 py-3 text-sm text-zinc-400">{r.college || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-300">
                        {PASS_TYPE_LABELS[r.passType as PassType] || r.passType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-300 max-w-[200px] truncate" title={r.eventLabel || undefined}>
                      {r.eventLabel || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-400 whitespace-nowrap">
                      {r.selectedDay || '—'}
                    </td>
                    {canSeeAmount && (
                      <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">₹{r.amount}</td>
                    )}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                          r.isUsed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-700 text-zinc-400'
                        }`}
                      >
                        {r.isUsed ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-400 whitespace-nowrap">
                      {formatDate(r.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && (
          <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-950 px-4 py-3">
            <span className="text-xs text-zinc-500">
              Page {pagination.page} · {filteredData.length} passes
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md bg-zinc-800 px-3 py-1 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
              >
                <IconChevronLeft size={16} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!pagination.hasMore}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md bg-zinc-800 px-3 py-1 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
              >
                <IconChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
