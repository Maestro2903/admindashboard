'use client';

import * as React from 'react';
import type { ColumnDef, RowSelectionState, SortingState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AdminEvent, FinancialRecord } from '@/types/admin';
import type { UnifiedTableFilters } from './UnifiedTable';

const IST = 'Asia/Kolkata';

function safeStr(val: unknown): string {
  if (val == null) return '—';
  const s = String(val).trim();
  return s === '' || s === 'undefined' ? '—' : s;
}

function formatDate(iso: unknown): string {
  const s = safeStr(iso);
  if (s === '—') return s;
  const d = new Date(s);
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
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function FinancialTable({
  data,
  events,
  filters,
  onFiltersChange,
  loading,
  nextCursor,
  canPrev,
  onNextPage,
  onPrevPage,
  onRowClick,
  rowSelection: controlledRowSelection,
  onRowSelectionChange,
}: {
  data: FinancialRecord[];
  events: AdminEvent[];
  filters: UnifiedTableFilters;
  onFiltersChange: (next: UnifiedTableFilters) => void;
  loading?: boolean;
  nextCursor?: string | null;
  canPrev?: boolean;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  onRowClick?: (record: FinancialRecord) => void;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (updater: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)) => void;
}) {
  const ALL = '__all__';
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [internalSelection, setInternalSelection] = React.useState<RowSelectionState>({});
  const isControlled = controlledRowSelection !== undefined;
  const rowSelectionState = isControlled ? controlledRowSelection : internalSelection;
  const setRowSelectionState = onRowSelectionChange ?? setInternalSelection;
  const handleRowSelectionChange = React.useCallback(
    (updater: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)) => {
      setRowSelectionState(typeof updater === 'function' ? updater(rowSelectionState) : updater);
    },
    [setRowSelectionState, rowSelectionState]
  );

  const columns = React.useMemo<ColumnDef<FinancialRecord>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => {
          const rows = table.getRowModel().rows;
          const selected = rows.filter((r) => r.getIsSelected());
          const allSelected = rows.length > 0 && selected.length === rows.length;
          const someSelected = selected.length > 0;
          return (
            <Checkbox
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              onCheckedChange={() => {
                if (allSelected) rows.forEach((r) => r.toggleSelected(false));
                else rows.forEach((r) => r.toggleSelected(true));
              }}
              aria-label="Select all on page"
              className="border-zinc-600 data-[state=checked]:bg-zinc-600 data-[state=checked]:border-zinc-600"
            />
          );
        },
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(!!checked)}
            aria-label="Select row"
            className="border-zinc-600 data-[state=checked]:bg-zinc-600 data-[state=checked]:border-zinc-600"
            onClick={(e) => e.stopPropagation()}
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ getValue }) => (
          <div className="min-w-0 max-w-[12rem] truncate text-zinc-500" title={safeStr(getValue())}>
            {safeStr(getValue())}
          </div>
        ),
      },
      {
        accessorKey: 'college',
        header: 'College',
        cell: ({ getValue }) => (
          <div className="min-w-0 max-w-[12rem] truncate text-zinc-400" title={safeStr(getValue())}>
            {safeStr(getValue())}
          </div>
        ),
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        cell: ({ getValue }) => (
          <div className="truncate text-zinc-400" title={safeStr(getValue())}>
            {safeStr(getValue())}
          </div>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ getValue }) => (
          <div className="min-w-0 max-w-[14rem] truncate text-zinc-400" title={safeStr(getValue())}>
            {safeStr(getValue())}
          </div>
        ),
      },
      {
        accessorKey: 'eventName',
        header: 'Event',
        cell: ({ getValue }) => (
          <div className="min-w-0 max-w-[16rem] truncate text-zinc-400" title={safeStr(getValue())}>
            {safeStr(getValue())}
          </div>
        ),
      },
      {
        accessorKey: 'passType',
        header: 'Pass Type',
        cell: ({ getValue }) => (
          <Badge variant="outline" className="border-zinc-600 text-zinc-400 bg-transparent">
            {safeStr(getValue())}
          </Badge>
        ),
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap font-semibold text-emerald-400">
            {formatAmount(Number(getValue()) || 0)}
          </span>
        ),
      },
      {
        accessorKey: 'paymentStatus',
        header: 'Payment',
        cell: ({ getValue }) => {
          const status = String(getValue() || '—').toLowerCase();
          const isSuccess = status === 'success' || status === 'confirmed';
          const isPending = status === 'pending';
          const isFailed = status === 'failed';
          const className = isSuccess
            ? 'bg-emerald-500/10 text-emerald-400'
            : isFailed
              ? 'bg-red-500/10 text-red-400'
              : 'bg-amber-500/10 text-amber-400';
          return (
            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${className}`}>
              {String(getValue() || '—').toUpperCase()}
            </span>
          );
        },
      },
      {
        accessorKey: 'orderId',
        header: 'Order ID',
        cell: ({ getValue }) => (
          <div className="min-w-0 max-w-[10rem] truncate font-mono text-xs text-zinc-500" title={safeStr(getValue())}>
            {safeStr(getValue())}
          </div>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-zinc-500">{formatDate(getValue())}</span>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => String(row.passId),
    state: { sorting, rowSelection: rowSelectionState },
    onSortingChange: setSorting,
    onRowSelectionChange: handleRowSelectionChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const passTypes = React.useMemo(
    () => [...new Set(data.map((d) => d.passType).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [data]
  );
  const eventCategories = React.useMemo(
    () => [...new Set(events.map((e) => e.category).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b)),
    [events]
  );
  const eventTypes = React.useMemo(
    () => [...new Set(events.map((e) => e.type).filter((t): t is string => Boolean(t)))].sort((a, b) => a.localeCompare(b)),
    [events]
  );
  const hasSelection = Object.keys(rowSelectionState).length > 0;

  return (
    <div className="min-w-0 w-full space-y-4">
      {/* Filters — wrapped so they don't feel floating */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search name or email…"
            value={filters.q ?? ''}
            onChange={(e) => onFiltersChange({ ...filters, q: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-emerald-500 md:w-72"
          />
          <Select
            value={filters.passType ?? ALL}
            onValueChange={(v) => onFiltersChange({ ...filters, passType: v === ALL ? undefined : v })}
          >
            <SelectTrigger className="min-w-[160px] border-zinc-800 bg-zinc-950 text-white focus:ring-1 focus:ring-emerald-500">
              <SelectValue placeholder="Pass Type" />
            </SelectTrigger>
            <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-300">
              <SelectItem value={ALL}>All pass types</SelectItem>
              {passTypes.map((pt) => (
                <SelectItem key={pt} value={pt}>
                  {pt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.eventId ?? ALL}
            onValueChange={(v) => onFiltersChange({ ...filters, eventId: v === ALL ? undefined : v })}
          >
            <SelectTrigger className="min-w-[160px] border-zinc-800 bg-zinc-950 text-white focus:ring-1 focus:ring-emerald-500">
              <SelectValue placeholder="Event" />
            </SelectTrigger>
            <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-300">
              <SelectItem value={ALL}>All events</SelectItem>
              {events.map((ev) => (
                <SelectItem key={ev.id} value={ev.id}>
                  {ev.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {eventCategories.length > 0 ? (
            <Select
              value={filters.eventCategory ?? ALL}
              onValueChange={(v) => onFiltersChange({ ...filters, eventCategory: v === ALL ? undefined : v })}
            >
              <SelectTrigger className="min-w-[140px] border-zinc-800 bg-zinc-950 text-white focus:ring-1 focus:ring-emerald-500">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-300">
                <SelectItem value={ALL}>All categories</SelectItem>
                {eventCategories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {eventTypes.length > 0 ? (
            <Select
              value={filters.eventType ?? ALL}
              onValueChange={(v) => onFiltersChange({ ...filters, eventType: v === ALL ? undefined : v })}
            >
              <SelectTrigger className="min-w-[140px] border-zinc-800 bg-zinc-950 text-white focus:ring-1 focus:ring-emerald-500">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-300">
                <SelectItem value={ALL}>All types</SelectItem>
                {eventTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </div>

      <div className="min-w-0 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        {hasSelection ? (
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-800/60 px-4 py-3">
            <span className="text-sm text-zinc-400">
              {Object.keys(rowSelectionState).length.toLocaleString()} selected
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-md text-zinc-300 hover:bg-zinc-700 hover:text-white"
              onClick={() => handleRowSelectionChange({})}
            >
              Clear selection
            </Button>
          </div>
        ) : null}

        <div className="min-w-0 overflow-auto max-h-[calc(100vh-20rem)]">
            <Table className="w-full table-fixed text-sm">
              <TableHeader className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950 text-xs uppercase tracking-wider text-zinc-500">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="border-zinc-800 hover:bg-transparent">
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} className="px-4 py-3 text-left font-medium">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody className="divide-y divide-zinc-800/50">
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row) => {
                    const record = row.original;
                    return (
                      <TableRow
                        key={row.id}
                        data-state={row.getIsSelected() ? 'selected' : undefined}
                        className="border-b border-zinc-800 bg-transparent transition-colors duration-150 hover:bg-zinc-800/60 data-[state=selected]:bg-zinc-800"
                        onClick={onRowClick ? () => onRowClick(record) : undefined}
                        role={onRowClick ? 'button' : undefined}
                        tabIndex={onRowClick ? 0 : undefined}
                        onKeyDown={
                          onRowClick
                            ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  onRowClick(record);
                                }
                              }
                            : undefined
                        }
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            className="align-middle px-4 py-3 text-zinc-300 first:pl-4"
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 px-4 py-3 text-center text-zinc-500"
                    >
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-950 px-4 py-3">
          <span className="text-sm text-zinc-500">
            {loading ? 'Loading…' : `${table.getRowModel().rows.length.toLocaleString()} rows`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-md bg-zinc-800 px-3 py-1 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
              disabled={!canPrev || loading}
              onClick={onPrevPage}
            >
              Prev
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-md bg-zinc-800 px-3 py-1 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
              disabled={!nextCursor || loading}
              onClick={onNextPage}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
