'use client';

import { IconSearch } from '@tabler/icons-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface RegistrationsFiltersBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  passType?: string;
  onPassTypeChange: (value: string | undefined) => void;
  dateFrom?: string;
  dateTo?: string;
  onDateRangeChange: (from?: string, to?: string) => void;
  passTypeOptions: string[];
}

export function RegistrationsFiltersBar({
  search,
  onSearchChange,
  passType,
  onPassTypeChange,
  dateFrom,
  dateTo,
  onDateRangeChange,
  passTypeOptions,
}: RegistrationsFiltersBarProps) {
  const ALL = '__all__';

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 flex flex-wrap gap-3 items-center">
      <div className="relative flex-1 min-w-[220px] max-w-md">
        <IconSearch
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
        />
        <Input
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 bg-zinc-950 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-zinc-700"
        />
      </div>

      <Select
        value={passType ?? ALL}
        onValueChange={(val) => onPassTypeChange(val === ALL ? undefined : val)}
      >
        <SelectTrigger className="w-[160px] bg-zinc-950 border-zinc-800 text-zinc-200">
          <SelectValue placeholder="Pass type" />
        </SelectTrigger>
        <SelectContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
          <SelectItem value={ALL}>All pass types</SelectItem>
          {passTypeOptions.map((pt) => (
            <SelectItem key={pt} value={pt}>
              {pt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={dateFrom ?? ''}
          onChange={(e) => onDateRangeChange(e.target.value || undefined, dateTo)}
          className="w-[150px] bg-zinc-950 border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-zinc-700"
        />
        <span className="text-xs text-zinc-500">to</span>
        <Input
          type="date"
          value={dateTo ?? ''}
          onChange={(e) => onDateRangeChange(dateFrom, e.target.value || undefined)}
          className="w-[150px] bg-zinc-950 border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-zinc-700"
        />
      </div>
    </div>
  );
}

