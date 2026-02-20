'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AdminEvent, CleanUnifiedRecordWithId } from '@/types/admin';

const IST = 'Asia/Kolkata';

function formatDate(iso: unknown): string {
  if (!iso) return '—';
  const d = new Date(String(iso));
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

function safeStr(val: unknown): string {
  if (val == null) return '—';
  const s = String(val).trim();
  return s === '' || s === 'undefined' ? '—' : s;
}

export interface EventDashboardData {
  event: AdminEvent;
  metrics: {
    totalRegistrations: number;
    totalCheckIns: number;
    teamCount: number;
    remainingExpected: number;
    checkInPercentage: number;
  };
}

export function EventDashboard({
  data,
  records,
  loading,
  error,
  quickFilter,
  onQuickFilterChange,
  onExport,
}: {
  data: EventDashboardData | null;
  records: CleanUnifiedRecordWithId[];
  loading: boolean;
  error: string | null;
  quickFilter: 'all' | 'not_checked_in' | 'teams_incomplete';
  onQuickFilterChange: (v: 'all' | 'not_checked_in' | 'teams_incomplete') => void;
  onExport?: () => void;
}) {
  const filteredRecords = React.useMemo(() => {
    if (!records.length) return [];
    return records;
  }, [records]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="text-sm font-medium text-red-800">Failed to load event</div>
        <div className="mt-1 text-sm text-red-600">{error}</div>
      </div>
    );
  }

  if (!data && !loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
        Event not found.
      </div>
    );
  }

  const { event, metrics } = data ?? { event: null, metrics: null };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/events"
          className="text-sm text-slate-500 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300 rounded"
        >
          ← Events
        </Link>
      </div>

      {event && metrics && (
        <>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{event.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {event.date && `Date: ${event.date}`}
              {event.venue && ` · ${event.venue}`}
            </p>
            {(event.allowedPassTypes?.length ?? 0) > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {(event.allowedPassTypes ?? []).map((pt) => (
                  <Badge
                    key={pt}
                    variant="outline"
                    className="border-slate-300 text-slate-700"
                  >
                    {pt}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="pt-4">
                <div className="text-sm font-medium text-slate-500">Total Registrations</div>
                <div className="text-2xl font-semibold text-slate-900 tabular-nums">
                  {metrics.totalRegistrations.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="pt-4">
                <div className="text-sm font-medium text-slate-500">Total Check-ins</div>
                <div className="text-2xl font-semibold text-slate-900 tabular-nums">
                  {metrics.totalCheckIns.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="pt-4">
                <div className="text-sm font-medium text-slate-500">Team Count</div>
                <div className="text-2xl font-semibold text-slate-900 tabular-nums">
                  {metrics.teamCount.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="pt-4">
                <div className="text-sm font-medium text-slate-500">Remaining Expected</div>
                <div className="text-2xl font-semibold text-slate-900 tabular-nums">
                  {metrics.remainingExpected.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="pt-4">
                <div className="text-sm font-medium text-slate-500">Check-in %</div>
                <div className="text-2xl font-semibold text-slate-900 tabular-nums">
                  {metrics.checkInPercentage}%
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={quickFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                className={quickFilter === 'all' ? 'bg-slate-700 hover:bg-slate-600' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}
                onClick={() => onQuickFilterChange('all')}
              >
                All
              </Button>
              <Button
                variant={quickFilter === 'not_checked_in' ? 'default' : 'outline'}
                size="sm"
                className={quickFilter === 'not_checked_in' ? 'bg-slate-700 hover:bg-slate-600' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}
                onClick={() => onQuickFilterChange('not_checked_in')}
              >
                Not Checked In
              </Button>
              <Button
                variant={quickFilter === 'teams_incomplete' ? 'default' : 'outline'}
                size="sm"
                className={quickFilter === 'teams_incomplete' ? 'bg-slate-700 hover:bg-slate-600' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}
                onClick={() => onQuickFilterChange('teams_incomplete')}
              >
                Teams Incomplete
              </Button>
            </div>
            {onExport && (
              <Button
                variant="outline"
                size="sm"
                className="border-slate-300 text-slate-700 hover:bg-slate-100"
                onClick={onExport}
              >
                Export CSV
              </Button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full">
            <div className="max-h-[calc(100vh-24rem)] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <TableRow className="border-slate-200">
                    <TableHead className="px-5 py-4 text-left font-medium">Name</TableHead>
                    <TableHead className="px-5 py-4 text-left font-medium">Email</TableHead>
                    <TableHead className="px-5 py-4 text-left font-medium">College</TableHead>
                    <TableHead className="px-5 py-4 text-left font-medium">Pass Type</TableHead>
                    <TableHead className="px-5 py-4 text-left font-medium">Event</TableHead>
                    <TableHead className="px-5 py-4 text-left font-medium">Payment</TableHead>
                    <TableHead className="px-5 py-4 text-left font-medium">Registered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow className="border-slate-200">
                      <TableCell colSpan={7} className="px-5 py-4 h-24 text-center text-slate-500">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : filteredRecords.length ? (
                    filteredRecords.map((r) => (
                      <TableRow
                        key={r.passId}
                        className="border-slate-200 hover:bg-slate-50"
                      >
                        <TableCell className="px-5 py-4 text-slate-900">{safeStr(r.name)}</TableCell>
                        <TableCell className="px-5 py-4 max-w-[12rem] truncate text-slate-600">
                          {safeStr(r.email)}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-slate-600">{safeStr(r.college)}</TableCell>
                        <TableCell className="px-5 py-4 text-slate-600">{safeStr(r.passType)}</TableCell>
                        <TableCell className="px-5 py-4 text-slate-600">{safeStr(r.eventName)}</TableCell>
                        <TableCell className="px-5 py-4">
                          <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 rounded-full px-2 py-1 text-xs font-medium">
                            {r.paymentStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-5 py-4 text-slate-500">{formatDate(r.createdAt)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow className="border-slate-200">
                      <TableCell colSpan={7} className="px-5 py-4 h-24 text-center text-slate-500">
                        No registrations.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {loading && !data && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          Loading event…
        </div>
      )}
    </div>
  );
}
