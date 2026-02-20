'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { IconDownload, IconSearch, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { formatPhone } from '@/lib/utils';

interface TeamMember {
  memberId?: string;
  name: string;
  phone: string;
  isLeader?: boolean;
  attendance?: {
    checkedIn?: boolean;
    checkedInAt?: string;
    checkedInBy?: string;
  };
}

interface Team {
  id: string;
  teamName: string;
  leaderId: string;
  leaderPhone: string;
  eventName: string;
  totalMembers: number;
  members: TeamMember[];
  paymentStatus: string;
  passId?: string;
}

export default function TeamsPage() {
  const { user, loading: authLoading } = useAuth();
  const [teams, setTeams] = React.useState<Team[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const token = await user.getIdToken();
        // Fetch teams from passes API (group_events type)
        const res = await fetch('/api/admin/passes?type=group_events&pageSize=200&includeSummary=1', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to fetch teams');
        const data = await res.json();
        // Extract teams from records
        const teamMap = new Map<string, Team>();
        for (const record of data.records ?? []) {
          if (record.team) {
            teamMap.set(record.team.teamId, {
              id: record.team.teamId,
              teamName: record.team.teamName,
              leaderId: record.team.leaderName,
              leaderPhone: record.team.leaderPhone ?? '',
              eventName: record.eventName ?? '',
              totalMembers: record.team.totalMembers,
              members: record.team.members?.map((m: TeamMember) => ({
                memberId: m.memberId,
                name: m.name,
                phone: m.phone,
                isLeader: m.isLeader,
                attendance: {
                  checkedIn: (m as unknown as Record<string, unknown>).checkedIn as boolean,
                  checkedInAt: (m as unknown as Record<string, unknown>).checkInTime as string,
                  checkedInBy: (m as unknown as Record<string, unknown>).checkedInBy as string,
                },
              })) ?? [],
              paymentStatus: record.team.paymentStatus ?? 'success',
              passId: record.passId,
            });
          }
        }
        if (!cancelled) setTeams(Array.from(teamMap.values()));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load teams');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, user]);

  const handleExportCsv = React.useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/export/teams', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'teams.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error('Export failed');
    }
  }, [user]);

  const filteredTeams = React.useMemo(() => {
    if (!search.trim()) return teams;
    const q = search.toLowerCase();
    return teams.filter((t) =>
      t.teamName.toLowerCase().includes(q) ||
      t.leaderId.toLowerCase().includes(q) ||
      t.eventName?.toLowerCase().includes(q) ||
      t.leaderPhone?.replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
      t.members.some((m) => m.name.toLowerCase().includes(q) || (m.phone && m.phone.replace(/\D/g, '').includes(q.replace(/\D/g, ''))))
    );
  }, [teams, search]);

  const toggleExpanded = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Teams</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{teams.length} teams registered</p>
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

      {/* Search */}
      <div className="relative max-w-md">
        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <Input
          placeholder="Search teams or members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-zinc-700"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="w-8 px-3 py-3" />
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Team Name</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Leader</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500 w-[120px]">Phone</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500 min-w-[140px]">Events</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Members</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Payment</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-zinc-800" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredTeams.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-zinc-500">No teams found</td>
                </tr>
              ) : (
                filteredTeams.map((team) => {
                  const checkedIn = team.members.filter((m) => m.attendance?.checkedIn).length;
                  const attendancePercent = team.totalMembers > 0 ? Math.round((checkedIn / team.totalMembers) * 100) : 0;

                  return (
                    <React.Fragment key={team.id}>
                      <tr
                        className="hover:bg-zinc-800/50 transition-colors cursor-pointer"
                        onClick={() => toggleExpanded(team.id)}
                      >
                        <td className="px-3 py-3">
                          <button className="text-zinc-500 hover:text-zinc-300">
                            {expandedRows.has(team.id) ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-white">{team.teamName}</td>
                        <td className="px-4 py-3 text-sm text-zinc-300">{team.leaderId}</td>
                        <td className="px-4 py-3 text-sm tabular-nums text-zinc-400 whitespace-nowrap w-[120px]">{team.leaderPhone ? formatPhone(team.leaderPhone) : '—'}</td>
                        <td className="px-4 py-3 text-sm text-zinc-300 max-w-[180px] truncate" title={team.eventName || undefined}>{team.eventName || '—'}</td>
                        <td className="px-4 py-3 text-sm tabular-nums text-zinc-400">{team.totalMembers}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                            team.paymentStatus === 'success'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-amber-500/10 text-amber-400'
                          }`}>
                            {team.paymentStatus === 'success' ? 'Paid' : team.paymentStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-zinc-800 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all"
                                style={{ width: `${attendancePercent}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-zinc-400">{checkedIn}/{team.totalMembers}</span>
                          </div>
                        </td>
                      </tr>
                      {/* Expanded members */}
                      {expandedRows.has(team.id) && (
                        <tr>
                          <td colSpan={8} className="bg-zinc-950 px-8 py-4">
                            <div className="space-y-1">
                              {team.members.map((m, i) => (
                                <div key={i} className="flex items-center gap-4 rounded-lg bg-zinc-900 px-3 py-2 text-sm">
                                  <span className={`h-2 w-2 rounded-full shrink-0 ${m.attendance?.checkedIn ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                                  <span className="text-zinc-300 min-w-[150px]">{m.name}</span>
                                  <span className="text-zinc-500 tabular-nums">{formatPhone(m.phone)}</span>
                                  {m.isLeader && <span className="text-[10px] uppercase tracking-wider text-amber-500 font-medium">Leader</span>}
                                  {m.attendance?.checkedIn && (
                                    <span className="text-xs text-zinc-500 ml-auto">
                                      {m.attendance.checkedInAt || 'Checked in'}
                                      {m.attendance.checkedInBy && ` by ${m.attendance.checkedInBy}`}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
