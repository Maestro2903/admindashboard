'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { IconSearch, IconChevronLeft, IconChevronRight, IconCheck, IconX, IconTrash, IconDownload } from '@tabler/icons-react';

const PAGE_SIZE = 50;
type SortKey = 'createdAt' | 'updatedAt' | 'amount' | 'status' | 'passType' | 'name';
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'createdAt', label: 'Date created' },
  { value: 'updatedAt', label: 'Date updated' },
  { value: 'amount', label: 'Amount' },
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'passType', label: 'Pass type' },
];

interface Payment {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  amount: number;
  status: string;
  passType: string | null;
  cashfreeOrderId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-emerald-500/10 text-emerald-400',
  pending: 'bg-amber-500/10 text-amber-400',
  failed: 'bg-red-500/10 text-red-400',
};

export default function PaymentsPage() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [saving, setSaving] = useState(false);
  const [formStatus, setFormStatus] = useState<'pending' | 'success' | 'failed'>('pending');
  const [formNote, setFormNote] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [tablePage, setTablePage] = useState(1);

  const refetch = useCallback(() => {
    if (!user) return;
    user.getIdToken().then((token) =>
      fetch('/api/payments', { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => res.json())
        .then((data) => setPayments(data.payments || []))
    );
  }, [user]);

  const openEdit = (p: Payment) => {
    setEditPayment(p);
    setFormStatus(p.status as 'pending' | 'success' | 'failed');
    setFormNote('');
  };

  const savePayment = async () => {
    if (!editPayment || !user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/update-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          paymentId: editPayment.id,
          status: formStatus,
          ...(formNote.trim() ? { note: formNote.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Update failed');
      toast.success('Payment updated');
      setEditPayment(null);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const dateFmt = useMemo(
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

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const controller = new AbortController();
    (async () => {
      try {
        setLoading(true);
        const token = await user.getIdToken();
        const res = await fetch('/api/payments', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json();
        setPayments(data.payments || []);
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
  }, [user]);

  const filteredPayments = useMemo(() => {
    let results = payments;
    if (statusFilter !== 'all') {
      results = results.filter((p) => p.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      results = results.filter((p) =>
        (p.cashfreeOrderId?.toLowerCase().includes(q)) ||
        (p.id.toLowerCase().includes(q)) ||
        (p.passType?.toLowerCase().includes(q)) ||
        (p.name?.toLowerCase().includes(q)) ||
        (p.email?.toLowerCase().includes(q))
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    results = [...results].sort((a, b) => {
      let va: string | number | null = null;
      let vb: string | number | null = null;
      if (sortBy === 'createdAt') {
        va = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        vb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      } else if (sortBy === 'updatedAt') {
        va = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        vb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      } else if (sortBy === 'amount') {
        va = a.amount ?? 0;
        vb = b.amount ?? 0;
      } else if (sortBy === 'name') {
        va = (a.name ?? '').toLowerCase();
        vb = (b.name ?? '').toLowerCase();
      } else if (sortBy === 'status') {
        va = (a.status ?? '').toLowerCase();
        vb = (b.status ?? '').toLowerCase();
      } else {
        va = (a.passType ?? '').toLowerCase();
        vb = (b.passType ?? '').toLowerCase();
      }
      if (typeof va === 'number' && typeof vb === 'number') return dir * (va - vb);
      return dir * String(va).localeCompare(String(vb));
    });
    return results;
  }, [payments, statusFilter, search, sortBy, sortDir]);

  useEffect(() => {
    setTablePage(1);
  }, [search, statusFilter, sortBy, sortDir]);

  const totalFiltered = filteredPayments.length;
  const totalTablePages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const paginatedPayments = useMemo(
    () => filteredPayments.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE),
    [filteredPayments, tablePage]
  );

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );
  const toggleSelection = useCallback((id: string) => {
    setRowSelection((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);
  const selectAllOnPage = useCallback(
    (checked: boolean) => {
      setRowSelection((prev) => {
        const next = { ...prev };
        paginatedPayments.forEach((p) => {
          next[p.id] = checked;
        });
        return next;
      });
    },
    [paginatedPayments]
  );
  const clearSelection = useCallback(() => setRowSelection({}), []);
  const isAllSelected =
    paginatedPayments.length > 0 &&
    paginatedPayments.every((p) => rowSelection[p.id]);
  const isSomeSelected = paginatedPayments.some((p) => rowSelection[p.id]);

  const runBulkForceVerify = useCallback(async () => {
    if (!user || selectedIds.length === 0) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'forceVerifyPayment',
          targetCollection: 'payments',
          targetIds: selectedIds.slice(0, 100),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Action failed');
      const updated = data?.updated ?? 0;
      toast.success(`Marked ${updated} payment(s) as success`);
      setRowSelection({});
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    }
  }, [user, selectedIds, refetch]);

  const runBulkDelete = useCallback(async () => {
    if (!user || selectedIds.length === 0) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'delete',
          targetCollection: 'payments',
          targetIds: selectedIds.slice(0, 100),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Action failed');
      const updated = data?.updated ?? 0;
      toast.success(`Permanently deleted ${updated} payment(s)`);
      setRowSelection({});
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    }
  }, [user, selectedIds, refetch]);

  const totalRevenue = payments.filter((p) => p.status === 'success').reduce((sum, p) => sum + p.amount, 0);

  const handleExportCsv = useCallback(() => {
    const headers = ['Order ID', 'Name', 'Email', 'Pass Type', 'Amount', 'Status', 'Created', 'Updated'];
    const rows = filteredPayments.map((p) => [
      p.cashfreeOrderId || p.id,
      p.name ?? '',
      p.email ?? '',
      p.passType ?? '',
      p.amount,
      p.status,
      p.createdAt ?? '',
      p.updatedAt ?? '',
    ]);
    const escape = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv; charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [filteredPayments]);

  return (
    <div className="space-y-4 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Payments</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{payments.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-right">
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Total Revenue</div>
            <div className="text-xl font-semibold tabular-nums text-emerald-400">₹{totalRevenue.toLocaleString('en-IN')}</div>
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

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input
            placeholder="Search by Order ID, name, email, pass type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-zinc-700"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-800 text-zinc-300">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-300">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
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

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-800/60 px-4 py-3">
          <span className="text-sm text-zinc-300">
            {selectedIds.length} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
              onClick={runBulkForceVerify}
            >
              <IconCheck size={14} className="mr-1" />
              Mark as success
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
              onClick={() => {
                if (typeof window !== 'undefined' && window.confirm(`Permanently delete ${selectedIds.length} payment(s) from the database? This cannot be undone.`)) {
                  runBulkDelete();
                }
              }}
            >
              <IconTrash size={14} className="mr-1" />
              Delete permanently
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
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Order ID</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Name</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Email</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Pass Type</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Amount</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Status</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Created</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Updated</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-zinc-800" /></td>
                    ))}
                  </tr>
                ))
              ) : totalFiltered === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-zinc-500">No payments found</td>
                </tr>
              ) : (
                paginatedPayments.map((p) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-zinc-800/50 transition-colors ${rowSelection[p.id] ? 'bg-zinc-800/60' : ''}`}
                  >
                    <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={!!rowSelection[p.id]}
                        onCheckedChange={() => toggleSelection(p.id)}
                        aria-label="Select row"
                        className="border-zinc-600 data-[state=checked]:bg-zinc-600 data-[state=checked]:border-zinc-600"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-zinc-400">{p.cashfreeOrderId || p.id.slice(0, 12)}</td>
                    <td className="px-4 py-3 text-sm text-white">{p.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-zinc-400 max-w-[200px] truncate" title={p.email ?? undefined}>{p.email ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-300">
                        {p.passType || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium tabular-nums text-white">₹{p.amount}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[p.status] ?? 'bg-zinc-800 text-zinc-400'}`}>
                        {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-400 whitespace-nowrap">
                      {p.createdAt ? dateFmt.format(new Date(p.createdAt)) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-400 whitespace-nowrap">
                      {p.updatedAt ? dateFmt.format(new Date(p.updatedAt)) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
                        onClick={() => openEdit(p)}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 bg-zinc-950 px-4 py-3">
          <span className="text-xs text-zinc-500">
            {totalFiltered === 0
              ? '0 payments'
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

      {/* Edit Sheet */}
      <Sheet open={!!editPayment} onOpenChange={(open) => !open && setEditPayment(null)}>
        <SheetContent side="right" className="bg-zinc-900 border-zinc-800 text-white">
          <SheetHeader>
            <SheetTitle className="text-white">Edit Payment</SheetTitle>
          </SheetHeader>
          {editPayment && (
            <div className="mt-6 space-y-4">
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Order ID</Label>
                <p className="mt-1 text-sm font-mono text-zinc-300">{editPayment.cashfreeOrderId || editPayment.id}</p>
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Amount</Label>
                <p className="mt-1 text-sm font-medium text-white">₹{editPayment.amount}</p>
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Status</Label>
                <Select value={formStatus} onValueChange={(v) => setFormStatus(v as 'pending' | 'success' | 'failed')}>
                  <SelectTrigger className="mt-1.5 bg-zinc-800 border-zinc-700 text-zinc-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-300">
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Admin Note</Label>
                <Input
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="Optional note..."
                  className="mt-1.5 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600"
                />
              </div>
            </div>
          )}
          <SheetFooter className="mt-8">
            <Button
              variant="outline"
              onClick={() => setEditPayment(null)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={savePayment}
              disabled={saving}
              className="bg-white text-zinc-900 hover:bg-zinc-200"
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
