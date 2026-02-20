'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PassFiltersState, PassStatus } from '@/types/admin';

export function PassFilters({
  filters,
  onFiltersChange,
  isGroupEvents = false,
}: {
  filters: PassFiltersState;
  onFiltersChange: (next: PassFiltersState) => void;
  isGroupEvents?: boolean;
}) {
  const ALL = '__all__';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        type="date"
        placeholder="From"
        value={filters.from ?? ''}
        onChange={(e) => onFiltersChange({ ...filters, from: e.target.value || undefined })}
        className="h-9 w-[140px] border-zinc-600 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
      />
      <Input
        type="date"
        placeholder="To"
        value={filters.to ?? ''}
        onChange={(e) => onFiltersChange({ ...filters, to: e.target.value || undefined })}
        className="h-9 w-[140px] border-zinc-600 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
      />
      <Select
        value={filters.passStatus ?? ALL}
        onValueChange={(v) =>
          onFiltersChange({
            ...filters,
            passStatus: v === ALL ? undefined : (v as PassStatus | 'all'),
          })
        }
      >
        <SelectTrigger className="h-9 min-w-[120px] border-zinc-600 bg-zinc-800 text-zinc-100">
          <SelectValue placeholder="Pass Status" />
        </SelectTrigger>
        <SelectContent className="border-zinc-600 bg-zinc-800 text-zinc-100">
          <SelectItem value={ALL}>All</SelectItem>
          <SelectItem value="paid">Paid</SelectItem>
          <SelectItem value="used">Used</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filters.scanned ?? ALL}
        onValueChange={(v) =>
          onFiltersChange({
            ...filters,
            scanned:
              v === ALL ? undefined : (v === 'scanned' ? 'scanned' : 'not_scanned'),
          })
        }
      >
        <SelectTrigger className="h-9 min-w-[130px] border-zinc-600 bg-zinc-800 text-zinc-100">
          <SelectValue placeholder="Scanned" />
        </SelectTrigger>
        <SelectContent className="border-zinc-600 bg-zinc-800 text-zinc-100">
          <SelectItem value={ALL}>All</SelectItem>
          <SelectItem value="scanned">Scanned</SelectItem>
          <SelectItem value="not_scanned">Not Scanned</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="number"
        placeholder="Min amount"
        value={filters.amountMin ?? ''}
        onChange={(e) => {
          const v = e.target.value ? Number(e.target.value) : undefined;
          onFiltersChange({ ...filters, amountMin: v });
        }}
        className="h-9 w-[100px] border-zinc-600 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
      />
      <Input
        type="number"
        placeholder="Max amount"
        value={filters.amountMax ?? ''}
        onChange={(e) => {
          const v = e.target.value ? Number(e.target.value) : undefined;
          onFiltersChange({ ...filters, amountMax: v });
        }}
        className="h-9 w-[100px] border-zinc-600 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
      />
      {isGroupEvents && (
        <>
          <Input
            type="number"
            placeholder="Team size min"
            value={filters.teamSizeMin ?? ''}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : undefined;
              onFiltersChange({ ...filters, teamSizeMin: v });
            }}
            className="h-9 w-[110px] border-zinc-600 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
          />
          <Input
            type="number"
            placeholder="Team size max"
            value={filters.teamSizeMax ?? ''}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : undefined;
              onFiltersChange({ ...filters, teamSizeMax: v });
            }}
            className="h-9 w-[110px] border-zinc-600 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
          />
          <Input
            type="number"
            placeholder="Checked-in min"
            value={filters.checkedInMin ?? ''}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : undefined;
              onFiltersChange({ ...filters, checkedInMin: v });
            }}
            className="h-9 w-[120px] border-zinc-600 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
          />
        </>
      )}
    </div>
  );
}
