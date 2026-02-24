'use client';

import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import type { PassManagementRecord } from '@/types/admin';

const IST = 'Asia/Kolkata';

function formatDate(iso: unknown): string {
  if (iso == null || iso === '') return '—';
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

function formatDayPassDate(iso: unknown): string {
  if (iso == null || iso === '') return '—';
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

function safeStr(val: unknown): string {
  if (val == null) return '—';
  const s = String(val).trim();
  return s === '' || s === 'undefined' ? '—' : s;
}

const GROUP_EVENTS_WITH_TEAM_COLUMNS = 15;

export function PassTable({
  data,
  loading,
  isGroupEvents = false,
  passType,
  onRowClick,
}: {
  data: PassManagementRecord[];
  loading?: boolean;
  isGroupEvents?: boolean;
  passType?: string;
  onRowClick?: (record: PassManagementRecord) => void;
}) {
  const [expandedPassIds, setExpandedPassIds] = React.useState<Set<string>>(new Set());

  const toggleExpand = React.useCallback((e: React.MouseEvent, passId: string) => {
    e.stopPropagation();
    setExpandedPassIds((prev) => {
      const next = new Set(prev);
      if (next.has(passId)) next.delete(passId);
      else next.add(passId);
      return next;
    });
  }, []);

  const hasTeamPayload = isGroupEvents && data.some((r) => r.team != null);
  const baseColSpan = isGroupEvents ? 14 : 11;
  const colSpan = hasTeamPayload ? GROUP_EVENTS_WITH_TEAM_COLUMNS : baseColSpan + (passType === 'day_pass' ? 1 : 0);

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden w-full">
      <div className="overflow-x-auto">
        <div className="max-h-[calc(100vh-18rem)] overflow-auto">
          <Table className="w-full text-sm">
            <TableHeader className="sticky top-0 z-10 border-b border-zinc-700 bg-zinc-800 text-xs uppercase tracking-wide text-zinc-400">
              <TableRow className="border-zinc-700 hover:bg-zinc-800">
                {hasTeamPayload ? (
                  <>
                    <TableHead className="px-2 py-3 text-left font-medium w-10" />
                    <TableHead className="px-4 py-3 text-left font-medium">Pass ID</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Payment ID</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Amount</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Pass Status</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Created At</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Used At</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Scanned By</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Team Name</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Team ID</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Members</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Leader</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Leader Phone</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Leader College</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Payment</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead className="px-4 py-3 text-left font-medium">Pass ID</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">User Name</TableHead>
                    {passType === 'day_pass' && (
                      <TableHead className="px-4 py-3 text-left font-medium">Selected Day</TableHead>
                    )}
                    {isGroupEvents && (
                      <>
                        <TableHead className="px-4 py-3 text-left font-medium">Team Name</TableHead>
                        <TableHead className="px-4 py-3 text-left font-medium">Total Members</TableHead>
                        <TableHead className="px-4 py-3 text-left font-medium">Checked-In</TableHead>
                      </>
                    )}
                    <TableHead className="px-4 py-3 text-left font-medium">College</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Phone</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Amount</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Payment</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Pass Status</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Created At</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Used At</TableHead>
                    <TableHead className="px-4 py-3 text-left font-medium">Scanned By</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-zinc-800">
              {loading ? (
                <TableRow className="border-zinc-700 hover:bg-zinc-800/50">
                  <TableCell colSpan={colSpan} className="h-24 px-4 py-8 text-center text-zinc-500">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow className="border-zinc-700 hover:bg-zinc-800/50">
                  <TableCell colSpan={colSpan} className="h-24 px-4 py-8 text-center text-zinc-500">
                    No results.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row) => {
                  const team = row.team;
                  const hasMembers = team?.members?.length;
                  const isExpanded = expandedPassIds.has(row.passId);

                  if (hasTeamPayload && team) {
                    return (
                      <React.Fragment key={row.passId}>
                        <TableRow
                          className="border-zinc-700 transition-colors hover:bg-zinc-800/70 text-zinc-200"
                          onClick={onRowClick ? () => onRowClick(row) : undefined}
                          role={onRowClick ? 'button' : undefined}
                          tabIndex={onRowClick ? 0 : undefined}
                          onKeyDown={
                            onRowClick
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onRowClick(row);
                                  }
                                }
                              : undefined
                          }
                        >
                          <TableCell className="px-2 py-3 text-zinc-400">
                            {hasMembers ? (
                              <button
                                type="button"
                                onClick={(e) => toggleExpand(e, row.passId)}
                                className="p-0.5 rounded hover:bg-zinc-700"
                                aria-label={isExpanded ? 'Collapse members' : 'Expand members'}
                              >
                                {isExpanded ? (
                                  <ChevronDownIcon className="size-4" />
                                ) : (
                                  <ChevronRightIcon className="size-4" />
                                )}
                              </button>
                            ) : (
                              <span className="inline-block w-5" />
                            )}
                          </TableCell>
                          <TableCell className="px-4 py-3 font-mono text-xs text-zinc-300">
                            {row.passId.slice(0, 8)}…
                          </TableCell>
                          <TableCell className="px-4 py-3 font-mono text-xs text-zinc-300">
                            {row.paymentId ? `${row.paymentId.slice(0, 8)}…` : '—'}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-zinc-300">
                            ₹{row.amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <Badge
                              variant="outline"
                              className={
                                row.passStatus === 'used'
                                  ? 'border-amber-500/50 text-amber-400'
                                  : 'border-zinc-500 text-zinc-400'
                              }
                            >
                              {row.passStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap text-zinc-400">
                            {formatDate(row.createdAt)}
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap text-zinc-400">
                            {row.usedAt ? formatDate(row.usedAt) : '—'}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-zinc-400">
                            {safeStr(row.scannedBy)}
                          </TableCell>
                          <TableCell className="px-4 py-3 max-w-[10rem] truncate" title={team.teamName}>
                            {safeStr(team.teamName)}
                          </TableCell>
                          <TableCell className="px-4 py-3 font-mono text-xs text-zinc-300">
                            {team.teamId ? `${team.teamId.slice(0, 8)}…` : '—'}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-zinc-300">
                            {team.totalMembers}
                          </TableCell>
                          <TableCell className="px-4 py-3 max-w-[8rem] truncate" title={team.leaderName}>
                            {safeStr(team.leaderName)}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-zinc-300">
                            {safeStr(team.leaderPhone)}
                          </TableCell>
                          <TableCell className="px-4 py-3 max-w-[10rem] truncate" title={team.leaderCollege}>
                            {safeStr(team.leaderCollege)}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
                              {team.paymentStatus || 'success'}
                            </span>
                          </TableCell>
                        </TableRow>
                        {isExpanded && hasMembers && (
                          <TableRow className="border-zinc-700 bg-zinc-800/50">
                            <TableCell colSpan={GROUP_EVENTS_WITH_TEAM_COLUMNS} className="p-0">
                              <div className="border-t border-zinc-700 bg-zinc-800/80 px-4 py-3">
                                <p className="text-xs font-medium text-zinc-500 mb-2">Team members</p>
                                <div className="overflow-x-auto">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="border-zinc-700 hover:bg-transparent">
                                        <TableHead className="text-zinc-500 font-medium">Name</TableHead>
                                        <TableHead className="text-zinc-500 font-medium">Phone</TableHead>
                                        <TableHead className="text-zinc-500 font-medium">Email</TableHead>
                                        <TableHead className="text-zinc-500 font-medium">Leader</TableHead>
                                        <TableHead className="text-zinc-500 font-medium">Checked In</TableHead>
                                        <TableHead className="text-zinc-500 font-medium">Check-in Time</TableHead>
                                        <TableHead className="text-zinc-500 font-medium">Checked-in By</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {team.members.map((member, idx) => (
                                        <TableRow
                                          key={idx}
                                          className="border-zinc-700/80 hover:bg-zinc-800/50 text-zinc-300"
                                        >
                                          <TableCell className="py-2">{safeStr(member.name)}</TableCell>
                                          <TableCell className="py-2">{safeStr(member.phone)}</TableCell>
                                          <TableCell className="py-2 max-w-[12rem] truncate">
                                            {safeStr(member.email)}
                                          </TableCell>
                                          <TableCell className="py-2">
                                            {member.isLeader ? (
                                              <Badge className="bg-amber-500/20 text-amber-400 border-0">
                                                Leader
                                              </Badge>
                                            ) : (
                                              '—'
                                            )}
                                          </TableCell>
                                          <TableCell className="py-2">
                                            {member.checkedIn ? (
                                              <span className="text-emerald-400">Yes</span>
                                            ) : (
                                              <span className="text-zinc-500">No</span>
                                            )}
                                          </TableCell>
                                          <TableCell className="py-2 whitespace-nowrap text-zinc-400">
                                            {member.checkInTime ? formatDate(member.checkInTime) : '—'}
                                          </TableCell>
                                          <TableCell className="py-2 font-mono text-xs text-zinc-500">
                                            {member.checkedInBy ? `${member.checkedInBy.slice(0, 8)}…` : '—'}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  }

                  return (
                    <TableRow
                      key={row.passId}
                      className="border-zinc-700 transition-colors hover:bg-zinc-800/70 text-zinc-200"
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      role={onRowClick ? 'button' : undefined}
                      tabIndex={onRowClick ? 0 : undefined}
                      onKeyDown={
                        onRowClick
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onRowClick(row);
                              }
                            }
                          : undefined
                      }
                    >
                      <TableCell className="px-4 py-3 font-mono text-xs text-zinc-300">
                        {row.passId.slice(0, 8)}…
                      </TableCell>
                      <TableCell className="px-4 py-3 max-w-[10rem] truncate" title={row.userName}>
                        {safeStr(row.userName)}
                      </TableCell>
                      {passType === 'day_pass' && (
                        <TableCell className="px-4 py-3 whitespace-nowrap text-zinc-300">
                          {formatDayPassDate(row.dayPassDate)}
                        </TableCell>
                      )}
                      {isGroupEvents && (
                        <>
                          <TableCell className="px-4 py-3 max-w-[10rem] truncate" title={row.teamName}>
                            {safeStr(row.teamName)}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-zinc-300">
                            {row.totalMembers ?? '—'}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-zinc-300">
                            {row.checkedInCount ?? '—'}
                          </TableCell>
                        </>
                      )}
                      <TableCell className="px-4 py-3 max-w-[10rem] truncate" title={row.college}>
                        {safeStr(row.college)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-zinc-300">{safeStr(row.phone)}</TableCell>
                      <TableCell className="px-4 py-3 text-zinc-300">
                        ₹{row.amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
                          success
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            row.passStatus === 'used'
                              ? 'border-amber-500/50 text-amber-400'
                              : 'border-zinc-500 text-zinc-400'
                          }
                        >
                          {row.passStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 whitespace-nowrap text-zinc-400">
                        {formatDate(row.createdAt)}
                      </TableCell>
                      <TableCell className="px-4 py-3 whitespace-nowrap text-zinc-400">
                        {row.usedAt ? formatDate(row.usedAt) : '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-zinc-400">
                        {safeStr(row.scannedBy)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
