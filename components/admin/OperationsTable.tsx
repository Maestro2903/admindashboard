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
import type { AdminEvent, OperationsRecord } from '@/types/admin';
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

export function OperationsTable({
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
  data: OperationsRecord[];
  events: AdminEvent[];
  filters: UnifiedTableFilters;
  onFiltersChange: (next: UnifiedTableFilters) => void;
  loading?: boolean;
  nextCursor?: string | null;
  canPrev?: boolean;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  onRowClick?: (record: OperationsRecord) => void;
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

  const columns = React.useMemo<ColumnDef<OperationsRecord>[]>(
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
              className="border-slate-300 data-[state=checked]:bg-slate-700 data-[state=checked]:border-slate-700"
            />
          );
        },
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(!!checked)}
            aria-label="Select row"
            className="border-slate-300 data-[state=checked]:bg-slate-700 data-[state=checked]:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ getValue }) => (
          <div className="min-w-0 max-w-[12rem] truncate text-slate-900" title={safeStr(getValue())}>
            {safeStr(getValue())}
          </div>
        ),
      },
      {
        accessorKey: 'college',
        header: 'College',
        cell: ({ getValue }) => (
          <div className="min-w-0 max-w-[12rem] truncate text-slate-700" title={safeStr(getValue())}>
            {safeStr(getValue())}
          </div>
        ),
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        cell: ({ getValue }) => (
          <div className="truncate text-slate-700" title={safeStr(getValue())}>
            {safeStr(getValue())}
          </div>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ getValue }) => (
          <div className="min-w-0 max-w-[14rem] truncate text-slate-700" title={safeStr(getValue())}>
            {safeStr(getValue())}
          </div>
        ),
      },
      {
        accessorKey: 'eventName',
        header: 'Event',
        cell: ({ getValue }) => (
          <div className="min-w-0 max-w-[16rem] truncate text-slate-700" title={safeStr(getValue())}>
            {safeStr(getValue())}
          </div>
        ),
      },
      {
        accessorKey: 'passType',
        header: 'Pass Type',
        cell: ({ getValue }) => (
          <Badge variant="outline" className="border-slate-300 text-slate-700">
            {safeStr(getValue())}
          </Badge>
        ),
      },
      {
        id: 'payment',
        header: 'Payment',
        cell: () => (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
            Confirmed
          </span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-slate-500">{formatDate(getValue())}</span>
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
  const hasSelection = Object.keys(rowSelectionState).length > 0;

  return (
    <div className="space-y-4">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search name or email…"
          value={filters.q ?? ''}
          onChange={(e) => onFiltersChange({ ...filters, q: e.target.value })}
          className="w-full bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 md:w-72"
        />
        <Select
          value={filters.passType ?? ALL}
          onValueChange={(v) => onFiltersChange({ ...filters, passType: v === ALL ? undefined : v })}
        >
          <SelectTrigger className="min-w-[160px] border-slate-200 bg-white text-slate-900">
            <SelectValue placeholder="Pass Type" />
          </SelectTrigger>
          <SelectContent className="border-slate-200 bg-white text-slate-900">
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
          <SelectTrigger className="min-w-[160px] border-slate-200 bg-white text-slate-900">
            <SelectValue placeholder="Event" />
          </SelectTrigger>
          <SelectContent className="border-slate-200 bg-white text-slate-900">
            <SelectItem value={ALL}>All events</SelectItem>
            {events.map((ev) => (
              <SelectItem key={ev.id} value={ev.id}>
                {ev.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full">
        {hasSelection ? (
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-4 py-2">
            <span className="text-sm text-slate-600">
              {Object.keys(rowSelectionState).length.toLocaleString()} selected
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="rounded-md border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              onClick={() => handleRowSelectionChange({})}
            >
              Clear selection
            </Button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <div className="max-h-[calc(100vh-22rem)] overflow-auto">
            <Table className="w-full table-fixed text-sm">
              <TableHeader className="sticky top-0 z-10 border-slate-200 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="border-slate-200">
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} className="px-5 py-4 text-left font-medium">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody className="divide-y divide-slate-200">
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row) => {
                    const record = row.original;
                    return (
                      <TableRow
                        key={row.id}
                        data-state={row.getIsSelected() ? 'selected' : undefined}
                        className="border-slate-200 transition-colors hover:bg-slate-50 data-[state=selected]:bg-slate-100"
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
                            className="align-middle px-5 py-4 text-slate-700 first:pl-5"
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow className="border-slate-200">
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 px-5 py-4 text-center text-slate-500"
                    >
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-100 px-4 py-3">
          <span className="text-sm text-slate-600">
            {loading ? 'Loading…' : `${table.getRowModel().rows.length.toLocaleString()} rows`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-slate-300 text-slate-700 hover:bg-slate-100"
              disabled={!canPrev || loading}
              onClick={onPrevPage}
            >
              Prev
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-slate-300 text-slate-700 hover:bg-slate-100"
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
