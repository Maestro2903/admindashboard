'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { BulkActionBar } from '@/components/admin/BulkActionBar';
import { RowDetailModal } from '@/components/admin/RowDetailModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AdminEvent, OperationsRecord, OperationsDashboardResponse } from '@/types/admin';
import { IconDownload, IconFilter, IconSearch, IconChevronLeft, IconChevronRight, IconX, IconRefresh } from '@tabler/icons-react';
import { formatPhone } from '@/lib/utils';

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

function toCleanRecord(r: OperationsRecord) {
  return {
    passId: r.passId,
    name: r.name,
    email: r.email,
    college: r.college,
    phone: r.phone,
    eventName: r.eventName,
    passType: r.passType,
    paymentStatus: 'success' as const,
    createdAt: r.createdAt,
  };
}

const PASS_TYPE_LABELS: Record<string, string> = {
  day_pass: 'Day Pass',
  group_events: 'Group Events',
  proshow: 'Proshow',
  sana_concert: 'Sana Concert',
};

const PASS_TYPE_COLORS: Record<string, string> = {
  day_pass: 'bg-blue-500/10 text-blue-400',
  group_events: 'bg-violet-500/10 text-violet-400',
  proshow: 'bg-emerald-500/10 text-emerald-400',
  sana_concert: 'bg-amber-500/10 text-amber-400',
};

const PAYMENT_COLORS: Record<string, string> = {
  success: 'bg-emerald-500/10 text-emerald-400',
  paid: 'bg-emerald-500/10 text-emerald-400',
  pending: 'bg-amber-500/10 text-amber-400',
  failed: 'bg-red-500/10 text-red-400',
};

const SKELETON_ROWS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/* ── Memoized table row ── */
const TableRow = React.memo(function TableRow({
  r,
  isSelected,
  onToggleSelect,
  onOpenDetail,
  dateFmt,
}: {
  r: OperationsRecord;
  isSelected: boolean;
  onToggleSelect: (passId: string, checked: boolean) => void;
  onOpenDetail: (r: OperationsRecord) => void;
  dateFmt: Intl.DateTimeFormat;
}) {
  const passColor = PASS_TYPE_COLORS[r.passType] ?? 'bg-zinc-800 text-zinc-300';
  const paymentKey = (r.payment ?? '').toLowerCase();
  const paymentColor = PAYMENT_COLORS[paymentKey] ?? 'bg-zinc-800 text-zinc-400';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpenDetail(r);
    }
  };

  return (
    <tr
      role="button"
      tabIndex={0}
      className={`cursor-pointer select-none transition-colors ${isSelected
          ? 'bg-zinc-700/50 border-l-2 border-l-emerald-500'
          : 'border-l-2 border-l-transparent hover:bg-zinc-800/50'
        }`}
      onClick={() => onOpenDetail(r)}
      onKeyDown={handleKeyDown}
    >
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="rounded border-zinc-600 bg-zinc-800"
          checked={isSelected}
          onChange={(e) => onToggleSelect(r.passId, e.target.checked)}
        />
      </td>
      <td className="px-4 py-2.5">
        <div className="text-sm font-semibold text-white">{r.name || '—'}</div>
        <div className="text-xs text-zinc-500 truncate max-w-[200px]">{r.email}</div>
      </td>
      <td className="px-4 py-2.5">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${passColor}`}>
          {PASS_TYPE_LABELS[r.passType] ?? r.passType}
        </span>
      </td>
      <td className="px-4 py-2.5 text-sm text-zinc-300 max-w-[200px] truncate">{r.eventName || '—'}</td>
      <td className="px-4 py-2.5 text-sm text-zinc-400">{r.college || '—'}</td>
      <td className="px-4 py-2.5 text-sm text-zinc-300 tabular-nums whitespace-nowrap w-[140px] min-w-[120px]">{formatPhone(r.phone)}</td>
      <td className="px-4 py-2.5">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${paymentColor}`}>
          {r.payment}
        </span>
      </td>
      <td className="px-4 py-2.5 text-sm text-zinc-400 tabular-nums whitespace-nowrap">
        {r.createdAt ? dateFmt.format(new Date(r.createdAt)) : '—'}
      </td>
    </tr>
  );
});

function OperationsClientInner() {
  const { user, userData, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();

  const [events, setEvents] = React.useState<AdminEvent[]>([]);
  const [data, setData] = React.useState<OperationsDashboardResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showFilters, setShowFilters] = React.useState(false);

  // Role Assignment State
  const [assignEmail, setAssignEmail] = React.useState('');
  const [assignRole, setAssignRole] = React.useState<'viewer' | 'manager' | 'superadmin'>('viewer');
  const [assigning, setAssigning] = React.useState(false);
  const [assignMessage, setAssignMessage] = React.useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleAssignRole = async () => {
    if (!user || !assignEmail.trim()) return;
    try {
      setAssigning(true);
      setAssignMessage(null);
      const token = await user.getIdToken(false);
      const res = await fetch('/api/admin/assign-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ email: assignEmail.trim(), role: assignRole })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to assign role');
      setAssignMessage({ type: 'success', text: `Successfully updated ${assignEmail} to ${assignRole}` });
      setAssignEmail('');
    } catch (e: any) {
      setAssignMessage({ type: 'error', text: e.message });
    } finally {
      setAssigning(false);
    }
  };

  const [search, setSearch] = React.useState(searchParams.get('q') ?? '');
  const [passType, setPassType] = React.useState(searchParams.get('passType') ?? 'all');
  const [eventId, setEventId] = React.useState(searchParams.get('eventId') ?? 'all');
  const [eventCategory, setEventCategory] = React.useState(searchParams.get('eventCategory') ?? 'all');
  const [eventType, setEventType] = React.useState(searchParams.get('eventType') ?? 'all');
  const [dateFrom, setDateFrom] = React.useState(searchParams.get('from') ?? '');
  const [dateTo, setDateTo] = React.useState(searchParams.get('to') ?? '');

  // Pending filter states (only applied on button click)
  const [pendingPassType, setPendingPassType] = React.useState(passType);
  const [pendingEventId, setPendingEventId] = React.useState(eventId);
  const [pendingEventCategory, setPendingEventCategory] = React.useState(eventCategory);
  const [pendingEventType, setPendingEventType] = React.useState(eventType);
  const [pendingDateFrom, setPendingDateFrom] = React.useState(dateFrom);
  const [pendingDateTo, setPendingDateTo] = React.useState(dateTo);

  const [cursorStack, setCursorStack] = React.useState<string[]>([]);
  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({});
  const [detailRecord, setDetailRecord] = React.useState<OperationsRecord | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const records = data?.records ?? [];
  const selectedPassIds = React.useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );
  const selectedRecords = React.useMemo(
    () => records.filter((r) => rowSelection[r.passId]).map(toCleanRecord),
    [records, rowSelection]
  );

  const handleToggleSelect = React.useCallback((passId: string, checked: boolean) => {
    setRowSelection((prev) => ({ ...prev, [passId]: checked }));
  }, []);

  const handleOpenDetail = React.useCallback((r: OperationsRecord) => {
    setDetailRecord(r);
  }, []);

  const handleClearFilters = React.useCallback(() => {
    setPassType('all');
    setEventId('all');
    setEventCategory('all');
    setEventType('all');
    setDateFrom('');
    setDateTo('');
    setPendingPassType('all');
    setPendingEventId('all');
    setPendingEventCategory('all');
    setPendingEventType('all');
    setPendingDateFrom('');
    setPendingDateTo('');
    setCursorStack([]);
  }, []);

  const handleApplyFilters = React.useCallback(() => {
    setPassType(pendingPassType);
    setEventId(pendingEventId);
    setEventCategory(pendingEventCategory);
    setEventType(pendingEventType);
    setDateFrom(pendingDateFrom);
    setDateTo(pendingDateTo);
    setCursorStack([]);
  }, [pendingPassType, pendingEventId, pendingEventCategory, pendingEventType, pendingDateFrom, pendingDateTo]);

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
    params.set('mode', 'operations');
    params.set('pageSize', '50');
    if (cursor) params.set('cursor', cursor);
    if (search.trim()) params.set('q', search.trim());
    if (passType && passType !== 'all') params.set('passType', passType);
    if (eventId && eventId !== 'all') params.set('eventId', eventId);
    if (eventCategory && eventCategory !== 'all') params.set('eventCategory', eventCategory);
    if (eventType && eventType !== 'all') params.set('eventType', eventType);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    return params.toString();
  }, [cursor, search, passType, eventId, eventCategory, eventType, dateFrom, dateTo]);

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
          const resp = await fetchJson<OperationsDashboardResponse>(
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

  const handleExportCsv = React.useCallback(async () => {
    if (!user) return;
    try {
      const params = new URLSearchParams();
      params.set('mode', 'operations');
      params.set('pageSize', '1000');
      params.set('format', 'csv');
      if (search.trim()) params.set('q', search.trim());
      if (passType && passType !== 'all') params.set('passType', passType);
      if (eventId && eventId !== 'all') params.set('eventId', eventId);
      if (eventCategory && eventCategory !== 'all') params.set('eventCategory', eventCategory);
      if (eventType && eventType !== 'all') params.set('eventType', eventType);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      const token = await user.getIdToken(false);
      const res = await fetch(`/api/admin/unified-dashboard?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'operations.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error(e);
    }
  }, [user, search, passType, eventId, eventCategory, eventType, dateFrom, dateTo]);

  const dateFmt = React.useMemo(
    () =>
      new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    []
  );

  const canPrev = cursorStack.length > 0;
  const hasNext = Boolean(data?.nextCursor);
  const pageNum = cursorStack.length + 1;

  return (
    <div className="space-y-4 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white">Operations</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Core event operations view</p>
          </div>
          {data && (
            <span className="inline-flex items-center rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-400 tabular-nums">
              {data.total?.toLocaleString() ?? records.length} results
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            onClick={() => setShowFilters(!showFilters)}
          >
            <IconFilter size={16} className="mr-1.5" />
            Filters
          </Button>
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

      {/* SuperAdmin Role Assignment */}
      {userData?.adminRole === 'superadmin' && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3 fade-in mt-4 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">SuperAdmin Role Assignment</h3>
            <p className="text-xs text-zinc-400 mt-1">Quickly assign administrative privileges to a registered user.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Input
              type="email"
              placeholder="User Email Address"
              value={assignEmail}
              onChange={(e) => setAssignEmail(e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500 sm:max-w-[300px]"
            />
            <Select value={assignRole} onValueChange={(val: any) => setAssignRole(val)}>
              <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-700 text-zinc-300 focus:ring-blue-500">
                <SelectValue placeholder="Select Role" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-300">
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="manager">Editor (Manager)</SelectItem>
                <SelectItem value="superadmin">SuperAdmin</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleAssignRole}
              disabled={assigning || !assignEmail.trim()}
              className="bg-blue-600 text-white hover:bg-blue-700 w-full sm:w-auto"
            >
              {assigning ? 'Assigning...' : 'Assign Role'}
            </Button>
          </div>
          {assignMessage && (
            <div className={`text-xs mt-2 ${assignMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
              {assignMessage.text}
            </div>
          )}
        </div>
      )}

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="relative">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCursorStack([]);
            }}
            className="pl-9 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-zinc-700"
          />
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 fade-in">
            <div>
              <label htmlFor="filter-pass-type" className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1.5 block">
                Pass Type
              </label>
              <Select value={pendingPassType} onValueChange={setPendingPassType}>
                <SelectTrigger id="filter-pass-type" className="bg-zinc-800 border-zinc-700 text-zinc-300">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-300">
                  <SelectItem value="all">All</SelectItem>
                  {Object.entries(PASS_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="filter-event" className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1.5 block">
                Event
              </label>
              <Select value={pendingEventId} onValueChange={setPendingEventId}>
                <SelectTrigger id="filter-event" className="bg-zinc-800 border-zinc-700 text-zinc-300">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-300">
                  <SelectItem value="all">All</SelectItem>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {[...new Set(events.map((e) => e.category).filter(Boolean))].length > 0 ? (
              <div>
                <label htmlFor="filter-event-category" className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1.5 block">
                  Category
                </label>
                <Select value={pendingEventCategory} onValueChange={setPendingEventCategory}>
                  <SelectTrigger id="filter-event-category" className="bg-zinc-800 border-zinc-700 text-zinc-300">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-300">
                    <SelectItem value="all">All</SelectItem>
                    {[...new Set(events.map((e) => e.category).filter((c): c is string => Boolean(c)))].sort().map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {[...new Set(events.map((e) => e.type).filter(Boolean))].length > 0 ? (
              <div>
                <label htmlFor="filter-event-type" className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1.5 block">
                  Type
                </label>
                <Select value={pendingEventType} onValueChange={setPendingEventType}>
                  <SelectTrigger id="filter-event-type" className="bg-zinc-800 border-zinc-700 text-zinc-300">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-300">
                    <SelectItem value="all">All</SelectItem>
                    {[...new Set(events.map((e) => e.type).filter((t): t is string => Boolean(t)))].sort().map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div>
              <label htmlFor="filter-date-from" className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1.5 block">
                From Date
              </label>
              <Input
                id="filter-date-from"
                type="date"
                value={pendingDateFrom}
                onChange={(e) => setPendingDateFrom(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-300"
              />
            </div>
            <div>
              <label htmlFor="filter-date-to" className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1.5 block">
                To Date
              </label>
              <Input
                id="filter-date-to"
                type="date"
                value={pendingDateTo}
                onChange={(e) => setPendingDateTo(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-300"
              />
            </div>
            
            {/* Filter Action Buttons */}
            <div className="col-span-2 lg:col-span-4 flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <IconX size={16} className="mr-1.5" />
                Clear Filters
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleApplyFilters}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <IconRefresh size={16} className="mr-1.5" />
                Apply Filters
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm font-medium text-red-400">Failed to load operations</p>
          <p className="mt-1 text-sm text-red-400/70">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-zinc-800 bg-zinc-950">
                <th className="w-10 px-4 py-2.5 bg-zinc-950">
                  <input
                    type="checkbox"
                    className="rounded border-zinc-600 bg-zinc-800"
                    checked={records.length > 0 && selectedPassIds.length === records.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const sel: Record<string, boolean> = {};
                        records.forEach((r) => { sel[r.passId] = true; });
                        setRowSelection(sel);
                      } else {
                        setRowSelection({});
                      }
                    }}
                  />
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500 bg-zinc-950">Name</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500 bg-zinc-950">Pass Type</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500 bg-zinc-950">Event</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500 bg-zinc-950">College</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500 bg-zinc-950 w-[140px] min-w-[120px]">Phone</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500 bg-zinc-950">Payment</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500 bg-zinc-950">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading && records.length === 0 ? (
                SKELETON_ROWS.map((n) => (
                  <tr key={n}>
                    <td className="px-4 py-2.5"><div className="h-4 w-4 animate-pulse rounded bg-zinc-800" /></td>
                    <td className="px-4 py-2.5"><div className="h-4 w-28 animate-pulse rounded bg-zinc-800" /></td>
                    <td className="px-4 py-2.5"><div className="h-4 w-20 animate-pulse rounded bg-zinc-800" /></td>
                    <td className="px-4 py-2.5"><div className="h-4 w-24 animate-pulse rounded bg-zinc-800" /></td>
                    <td className="px-4 py-2.5"><div className="h-4 w-20 animate-pulse rounded bg-zinc-800" /></td>
                    <td className="px-4 py-2.5"><div className="h-4 w-20 animate-pulse rounded bg-zinc-800" /></td>
                    <td className="px-4 py-2.5"><div className="h-4 w-16 animate-pulse rounded bg-zinc-800" /></td>
                    <td className="px-4 py-2.5"><div className="h-4 w-20 animate-pulse rounded bg-zinc-800" /></td>
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-zinc-500">
                    No records found
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <TableRow
                    key={r.passId}
                    r={r}
                    isSelected={!!rowSelection[r.passId]}
                    onToggleSelect={handleToggleSelect}
                    onOpenDetail={handleOpenDetail}
                    dateFmt={dateFmt}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3">
          <span className="text-xs text-zinc-500">
            Page {pageNum}{records.length > 0 ? ` · ${records.length} records` : ''}{selectedPassIds.length > 0 ? ` · ${selectedPassIds.length} selected` : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!canPrev}
              onClick={() => setCursorStack((s) => s.slice(0, -1))}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              <IconChevronLeft size={16} />
              Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!hasNext}
              onClick={() => {
                const next = data?.nextCursor;
                if (next) setCursorStack((s) => [...s, next]);
              }}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              Next
              <IconChevronRight size={16} />
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      <BulkActionBar
        selectedCount={selectedPassIds.length}
        selectedPassIds={selectedPassIds}
        selectedRecords={selectedRecords}
        onClearSelection={() => setRowSelection({})}
        onSuccess={() => setRefreshKey((k) => k + 1)}
        getToken={async () => (user ? user.getIdToken(false) : '')}
        adminRole={userData?.adminRole}
      />

      {/* Detail Drawer */}
      <RowDetailModal
        record={detailRecord ? toCleanRecord(detailRecord) : null}
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        onUpdated={() => {
          setDetailRecord(null);
          setRefreshKey((k) => k + 1);
        }}
        getToken={async () => (user ? user.getIdToken(false) : '')}
        adminRole={userData?.adminRole}
      />
    </div>
  );
}

export function OperationsClient() {
  return (
    <Suspense fallback={<Skeleton className="h-24 w-full" />}>
      <OperationsClientInner />
    </Suspense>
  );
}
