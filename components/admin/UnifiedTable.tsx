'use client';

import * as React from 'react';
import type { ColumnDef, GroupingState, RowSelectionState, SortingState, ExpandedState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
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
import type { AdminEvent, CleanUnifiedRecordWithId } from '@/types/admin';

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

export type UnifiedTableFilters = {
  passType?: string;
  eventId?: string;
  eventCategory?: string;
  eventType?: string;
  q?: string;
  from?: string;
  to?: string;
};

function getGroupCount(subRows: unknown[]): number {
  return subRows.length;
}

type GroupByOption = 'none' | 'passType' | 'eventGroup' | 'college';

export function UnifiedTable({
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
  onSelectionChange,
  rowSelection: controlledRowSelection,
  onRowSelectionChange,
}: {
  data: CleanUnifiedRecordWithId[];
  events: AdminEvent[];
  filters: UnifiedTableFilters;
  onFiltersChange: (next: UnifiedTableFilters) => void;
  loading?: boolean;
  nextCursor?: string | null;
  canPrev?: boolean;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  onRowClick?: (record: CleanUnifiedRecordWithId) => void;
  onSelectionChange?: (selectedPassIds: string[], selectedRecords: CleanUnifiedRecordWithId[]) => void;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (updater: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)) => void;
}) {
  const ALL = '__all__';
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);
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
  const [groupBy, setGroupBy] = React.useState<GroupByOption>('passType');
  const grouping: GroupingState = React.useMemo(() => {
    if (groupBy === 'none') return [];
    if (groupBy === 'college') return ['college'];
    if (groupBy === 'eventGroup') return ['eventName'];
    return ['passType'];
  }, [groupBy]);
  const [expanded, setExpanded] = React.useState<ExpandedState>({});

  const columns = React.useMemo<ColumnDef<CleanUnifiedRecordWithId>[]>(() => [
      {
        id: 'select',
        header: ({ table }) => {
          const leafRows = table.getRowModel().rows.filter((r) => !r.getIsGrouped());
          const selectedLeaf = leafRows.filter((r) => r.getIsSelected());
          const allSelected = leafRows.length > 0 && selectedLeaf.length === leafRows.length;
          const someSelected = selectedLeaf.length > 0;
          return (
            <Checkbox
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              onCheckedChange={(checked) => {
                if (allSelected) {
                  table.getRowModel().rows.forEach((r) => r.toggleSelected(false));
                } else {
                  leafRows.forEach((r) => r.toggleSelected(true));
                }
              }}
              aria-label="Select all on page"
              className="border-slate-300 data-[state=checked]:bg-slate-700 data-[state=checked]:border-slate-700"
            />
          );
        },
        cell: ({ row }) => {
          if (row.getIsGrouped()) {
            return <span className="inline-block size-4" />;
          }
          return (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(checked) => row.toggleSelected(!!checked)}
              aria-label="Select row"
              className="border-slate-300 data-[state=checked]:bg-slate-700 data-[state=checked]:border-slate-700"
              onClick={(e) => e.stopPropagation()}
            />
          );
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: 'passType',
        header: 'Pass Type',
        accessorKey: 'passType',
        cell: ({ row, getValue }) => {
          if (row.getIsGrouped()) {
            const total = getGroupCount(row.subRows);
            return (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-700 hover:bg-slate-100" onClick={row.getToggleExpandedHandler()}>
                  {row.getIsExpanded() ? '−' : '+'}
                </Button>
                <span className="font-medium text-slate-900">{String(getValue<string>() || '—')}</span>
                <Badge variant="outline" className="border-slate-300 text-slate-600">{row.subRows.length.toLocaleString()}</Badge>
              </div>
            );
          }
          return (
            <Badge variant="outline" className="border-slate-300 text-slate-700">
              {safeStr(getValue())}
            </Badge>
          );
        },
        enableSorting: true,
      },
      {
        id: 'eventName',
        header: 'Event',
        accessorKey: 'eventName',
        cell: ({ row, getValue }) => {
          const val = safeStr(getValue());
          if (row.getIsGrouped()) {
            return (
              <div className="flex min-w-0 items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-slate-700 hover:bg-slate-100" onClick={row.getToggleExpandedHandler()}>
                  {row.getIsExpanded() ? '−' : '+'}
                </Button>
                <span className="min-w-0 truncate text-slate-900">{val}</span>
                <Badge variant="outline" className="shrink-0 border-slate-300 text-slate-600">{row.subRows.length.toLocaleString()}</Badge>
              </div>
            );
          }
          return (
            <div className="min-w-0 max-w-[16rem] truncate text-slate-700" title={val}>{val}</div>
          );
        },
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
        accessorKey: 'email',
        header: 'Email',
        cell: ({ getValue }) => (
          <div className="min-w-0 max-w-[14rem] truncate text-slate-700" title={safeStr(getValue())}>
            {safeStr(getValue())}
          </div>
        ),
      },
      {
        id: 'college',
        accessorKey: 'college',
        header: 'College',
        cell: ({ row, getValue }) => {
          if (row.getIsGrouped()) {
            const total = getGroupCount(row.subRows);
            return (
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-slate-700 hover:bg-slate-100"
                    onClick={row.getToggleExpandedHandler()}
                  >
                    {row.getIsExpanded() ? '−' : '+'}
                  </Button>
                  <span className="font-medium text-slate-900 min-w-0 truncate">
                    {String(getValue<string>() || '—')}
                  </span>
                  <Badge variant="outline" className="border-slate-300 text-slate-600">
                    {row.subRows.length.toLocaleString()}
                  </Badge>
                </div>
                <div className="text-xs text-slate-500 pl-9">
                  {total} total
                </div>
              </div>
            );
          }
          return (
            <div className="min-w-0 max-w-[12rem] truncate text-slate-700" title={safeStr(getValue())}>
              {safeStr(getValue())}
            </div>
          );
        },
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        cell: ({ getValue }) => {
          const val = safeStr(getValue());
          return (
            <div className="truncate text-slate-700" title={val}>
              {val}
            </div>
          );
        },
      },
      {
        id: 'payment',
        header: 'Payment',
        cell: () => (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
            SUCCESS
          </span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'createdAt',
        header: 'Registered On',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-slate-500">{formatDate(getValue())}</span>
        ),
      },
    ], []);

  const table = useReactTable({
    data,
    columns,
    getRowId: (row, index) => String((row as CleanUnifiedRecordWithId).passId ?? index),
    state: {
      sorting,
      grouping,
      expanded,
      rowSelection: rowSelectionState,
    },
    onSortingChange: setSorting,
    onGroupingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(grouping) : [];
      setGroupBy(next.length === 0 ? 'none' : (next[0] as GroupByOption));
    },
    onExpandedChange: setExpanded,
    onRowSelectionChange: handleRowSelectionChange,
    enableRowSelection: (row) => !row.getIsGrouped(),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  React.useEffect(() => {
    const rows = table.getSelectedRowModel().rows;
    onSelectionChange?.(rows.map((r) => r.id), rows.map((r) => r.original));
  }, [rowSelectionState, onSelectionChange]);

  const passTypes = React.useMemo(() => {
    return [...new Set(data.map((d) => d.passType).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
  }, [data]);

  const eventCategories = React.useMemo(() => {
    return [...new Set(events.map((e) => e.category).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b));
  }, [events]);

  const eventTypes = React.useMemo(() => {
    return [...new Set(events.map((e) => e.type).filter((t): t is string => Boolean(t)))].sort((a, b) => a.localeCompare(b));
  }, [events]);

  const hasSelection = Object.keys(rowSelectionState).length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Input
          placeholder="Search name or email…"
          value={filters.q ?? ''}
          onChange={(e) => onFiltersChange({ ...filters, q: e.target.value })}
          className="w-full md:w-72 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400"
        />
        <Select
          value={filters.passType ?? ALL}
          onValueChange={(v) =>
            onFiltersChange({ ...filters, passType: v === ALL ? undefined : v })
          }
        >
          <SelectTrigger className="min-w-[160px] bg-white border-slate-200 text-slate-900">
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
          onValueChange={(v) =>
            onFiltersChange({ ...filters, eventId: v === ALL ? undefined : v })
          }
        >
          <SelectTrigger className="min-w-[160px] bg-white border-slate-200 text-slate-900">
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
        {eventCategories.length > 0 ? (
          <Select
            value={filters.eventCategory ?? ALL}
            onValueChange={(v) =>
              onFiltersChange({ ...filters, eventCategory: v === ALL ? undefined : v })
            }
          >
            <SelectTrigger className="min-w-[140px] bg-white border-slate-200 text-slate-900">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-900">
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
            onValueChange={(v) =>
              onFiltersChange({ ...filters, eventType: v === ALL ? undefined : v })
            }
          >
            <SelectTrigger className="min-w-[140px] bg-white border-slate-200 text-slate-900">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-900">
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

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full">
        {hasSelection ? (
          <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex justify-between items-center">
            <span className="text-sm text-slate-600">
              {Object.keys(rowSelectionState).length.toLocaleString()} selected
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="bg-white border-slate-300 hover:bg-slate-50 rounded-md text-slate-700"
              onClick={() => handleRowSelectionChange({})}
            >
              Clear selection
            </Button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <div className="max-h-[calc(100vh-22rem)] overflow-auto">
            <Table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: '40px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '200px' }} />
                <col style={{ width: '160px' }} />
                <col style={{ width: '220px' }} />
                <col style={{ width: '160px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '120px' }} />
              </colgroup>
              <TableHeader className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
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
                    const isLeaf = !row.getIsGrouped();
                    const record = row.original as CleanUnifiedRecordWithId | undefined;
                    const handleRowClick = isLeaf && record && onRowClick ? () => onRowClick(record) : undefined;
                    const handleKeyDown =
                      isLeaf && record && onRowClick
                        ? (e: React.KeyboardEvent) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onRowClick(record);
                            }
                          }
                        : undefined;
                    return (
                      <TableRow
                        key={row.id}
                        data-state={row.getIsSelected() ? 'selected' : undefined}
                        className="border-slate-200 transition-colors hover:bg-slate-50 data-[state=selected]:bg-slate-100"
                        onClick={handleRowClick}
                        role={isLeaf && onRowClick ? 'button' : undefined}
                        tabIndex={isLeaf && onRowClick ? 0 : undefined}
                        onKeyDown={handleKeyDown}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="align-middle px-5 py-4 first:pl-5 whitespace-nowrap overflow-hidden text-ellipsis text-slate-700">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow className="border-slate-200">
                    <TableCell colSpan={columns.length + 1} className="h-24 text-center text-slate-500 px-5 py-4">
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-100">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-600">
              {loading ? 'Loading…' : `${table.getRowModel().rows.length.toLocaleString()} rows`}
            </span>
            <Select
              value={groupBy}
              onValueChange={(v) => setGroupBy(v as GroupByOption)}
            >
              <SelectTrigger className="w-[140px] border-slate-200 bg-white text-slate-900 text-sm">
                <SelectValue placeholder="Group by" />
              </SelectTrigger>
              <SelectContent className="border-slate-200 bg-white text-slate-900">
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="passType">Pass Type</SelectItem>
                <SelectItem value="eventGroup">Event</SelectItem>
                <SelectItem value="college">College</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-slate-300 hover:bg-slate-100 text-slate-700"
              disabled={!canPrev || loading}
              onClick={onPrevPage}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-300 hover:bg-slate-100 text-slate-700"
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

