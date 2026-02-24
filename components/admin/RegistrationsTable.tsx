'use client';

import type { RegistrationRow } from '@/types/admin';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const SKELETON_ROWS = [1, 2, 3, 4, 5, 6] as const;

interface RegistrationsTableProps {
  rows: RegistrationRow[];
  loading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  total?: number;
  onPageChange: (page: number) => void;
  onViewDetails?: (row: RegistrationRow) => void;
  onStatusChange?: (row: RegistrationRow, status: RegistrationRow['status']) => void;
}

const IST = 'Asia/Kolkata';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatAmount(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function RegistrationsTable({
  rows,
  loading,
  error,
  page,
  pageSize,
  total,
  onPageChange,
  onViewDetails,
  onStatusChange,
}: RegistrationsTableProps) {
  const pageCount = total && total > 0 ? Math.ceil(total / pageSize) : undefined;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      {error && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <Table className="w-full text-sm">
          <colgroup>
            <col style={{ width: '200px' }} />
            <col style={{ width: '200px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '140px' }} />
            <col style={{ width: '160px' }} />
            <col style={{ width: '220px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '170px' }} />
            <col style={{ width: '160px' }} />
          </colgroup>
          <TableHeader className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur text-xs uppercase tracking-wide text-zinc-500">
            <TableRow className="border-zinc-800">
              <TableHead className="px-4 py-3 text-left font-medium">Name</TableHead>
              <TableHead className="px-4 py-3 text-left font-medium">College</TableHead>
              <TableHead className="px-4 py-3 text-left font-medium">Phone</TableHead>
              <TableHead className="px-4 py-3 text-left font-medium">Pass Type</TableHead>
              <TableHead className="px-4 py-3 text-left font-medium">Selected Days</TableHead>
              <TableHead className="px-4 py-3 text-left font-medium">Selected Events</TableHead>
              <TableHead className="px-4 py-3 text-left font-medium">Amount</TableHead>
              <TableHead className="px-4 py-3 text-left font-medium whitespace-nowrap">Created At</TableHead>
              <TableHead className="px-4 py-3 text-left font-medium">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-zinc-800/60">
            {loading
              ? SKELETON_ROWS.map((n) => (
                  <TableRow key={n}>
                    {Array.from({ length: 9 }).map((_, idx) => (
                      <TableCell key={idx} className="px-4 py-3">
                        <div className="h-4 w-24 animate-pulse rounded bg-zinc-800" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="px-4 py-10 text-center text-sm text-zinc-500"
                    >
                      No pending registrations found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="hover:bg-zinc-800/40 transition-colors"
                    >
                      <TableCell className="px-4 py-3 align-middle">
                        <div className="text-sm font-medium text-white truncate max-w-[180px]">
                          {row.name || '—'}
                        </div>
                        <div className="text-xs text-zinc-500 truncate max-w-[180px]">
                          {row.email || '—'}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 align-middle text-sm text-zinc-300 truncate max-w-[200px]">
                        {row.college || '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3 align-middle text-sm text-zinc-300 tabular-nums">
                        {row.phone || '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3 align-middle text-xs text-zinc-200">
                        <span className="inline-flex rounded-full bg-zinc-800 px-2 py-1 text-[11px] font-medium">
                          {row.passType}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3 align-middle text-xs text-zinc-300">
                        {row.selectedDays && row.selectedDays.length > 0
                          ? row.selectedDays.join(', ')
                          : '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3 align-middle text-xs text-zinc-300">
                        {row.selectedEvents && row.selectedEvents.length > 0
                          ? row.selectedEvents.join(', ')
                          : '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3 align-middle text-sm text-zinc-100 tabular-nums">
                        {formatAmount(row.calculatedAmount)}
                      </TableCell>
                      <TableCell className="px-4 py-3 align-middle text-xs text-zinc-400 whitespace-nowrap">
                        {formatDate(row.createdAt)}
                      </TableCell>
                      <TableCell className="px-4 py-3 align-middle">
                        <Select
                          value={row.status}
                          onValueChange={(val: 'pending' | 'converted' | 'cancelled') =>
                            onStatusChange?.(row, val)
                          }
                        >
                          <SelectTrigger className="h-8 w-[140px] bg-zinc-900 border-zinc-700 text-xs text-zinc-100">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
                            <SelectItem value="pending">pending</SelectItem>
                            <SelectItem value="converted">converted</SelectItem>
                            <SelectItem value="cancelled">cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))
                )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3">
        <div className="text-xs text-zinc-500">
          {total != null
            ? `Showing ${rows.length} of ${total} registrations`
            : `${rows.length} registrations`}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-800"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={loading || page <= 1}
          >
            Prev
          </Button>
          <span className="text-xs text-zinc-400 tabular-nums">
            Page {page}
            {pageCount ? ` of ${pageCount}` : null}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-800"
            onClick={() => onPageChange(page + 1)}
            disabled={loading || (pageCount != null && page >= pageCount)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

