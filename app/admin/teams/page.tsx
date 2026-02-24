'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { IconDownload, IconSearch, IconChevronDown, IconChevronRight, IconTrash, IconRotate, IconAlertTriangle, IconEdit, IconArchive, IconRefresh, IconPlus } from '@tabler/icons-react';
import { formatPhone } from '@/lib/utils';
import { canMutateTeams } from '@/lib/admin/adminRoles';
import type { AdminRole } from '@/types/admin';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';

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
  isArchived?: boolean;
}

const SKELETON_ROWS = [1, 2, 3, 4, 5] as const;
const SKELETON_CELLS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

function DeleteConfirmModal({
  open,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        role="button"
        tabIndex={0}
        aria-label="Close dialog"
        onClick={onCancel}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCancel(); } }}
      />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
            <IconAlertTriangle size={20} className="text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Delete Team</h3>
            <p className="text-xs text-zinc-500">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-zinc-400 mb-6">
          This will permanently remove the team and their passes from the database. All associated data will be lost.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-lg bg-red-500/20 px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-50"
          >
            {loading ? 'Deleting...' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeamsPage() {
  const { user, loading: authLoading } = useAuth();
  const [teams, setTeams] = React.useState<Team[]>([]);
  const [adminRole, setAdminRole] = React.useState<AdminRole>('viewer');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());

  const [deleteTeamId, setDeleteTeamId] = React.useState<string | null>(null);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [editTeam, setEditTeam] = React.useState<Team | null>(null);
  const [editForm, setEditForm] = React.useState({ teamName: '' });

  // Fetch admin role and teams
  const fetchData = React.useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const token = await user.getIdToken(false);

      // Attempt to get admin role (could also just read from context if exposed)
      const roleRes = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
      if (roleRes.ok) {
        const roleData = await roleRes.json();
        setAdminRole(roleData.adminRole || 'viewer');
      }

      const res = await fetch('/api/admin/teams', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch teams');
      const data = await res.json();
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
            isArchived: record.team.isArchived,
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
      setTeams(Array.from(teamMap.values()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    if (authLoading || !user) return;
    fetchData();
  }, [authLoading, user, fetchData]);

  const handleExportCsv = React.useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken(false);
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

  const handleDeleteTeam = async () => {
    if (!user || !deleteTeamId) return;
    setActionLoading(true);
    try {
      const token = await user.getIdToken(false);

      // Delete the team document
      const res = await fetch(`/api/admin/teams/${deleteTeamId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete team');

      toast.success('Team deleted successfully');
      setDeleteTeamId(null);
      fetchData(); // Refresh the list
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevertPayment = async (teamId: string, passId?: string) => {
    if (!user || !passId) {
      toast.error('Cannot revert: Pass ID is missing');
      return;
    }
    setActionLoading(true);
    try {
      const token = await user.getIdToken(false);
      const res = await fetch(`/api/admin/passes/${passId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'revertUsed' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Failed');

      toast.success('Pass usage reverted');
      fetchData(); // Refresh the list
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Revert failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleArchive = async (team: Team) => {
    if (!user) return;
    setActionLoading(true);
    try {
      const token = await user.getIdToken(false);
      const res = await fetch('/api/admin/update-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ teamId: team.id, isArchived: !team.isArchived }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Archive failed');

      toast.success(team.isArchived ? 'Team unarchived' : 'Team archived');
      fetchData(); // Refresh the list
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const openEdit = (t: Team) => {
    setEditTeam(t);
    setEditForm({ teamName: t.teamName });
  };

  const saveTeamEdit = async () => {
    if (!user || !editTeam) return;
    setActionLoading(true);
    try {
      const token = await user.getIdToken(false);
      const res = await fetch('/api/admin/update-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ teamId: editTeam.id, teamName: editForm.teamName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Update failed');

      toast.success('Team updated successfully');
      setEditTeam(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddTeam = () => {
    toast.info('Direct Team creation is not supported from this dashboard. Users must register via the frontend Group Events flow.');
  };

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

  const toggleExpanded = (id: string, e?: React.MouseEvent | React.KeyboardEvent) => {
    // Stop propagation if clicking a button inside the row
    if (e && (e.target as HTMLElement).closest('button.action-btn')) {
      return;
    }

    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasMutationAccess = canMutateTeams(adminRole);

  return (
    <div className="space-y-4 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Teams</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{teams.length} teams registered</p>
        </div>
        <div className="flex items-center gap-2">
          {hasMutationAccess && (
            <Button
              variant="default"
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-500"
              onClick={handleAddTeam}
            >
              <IconPlus size={16} className="mr-1.5" />
              Add Team
            </Button>
          )}
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
                {hasMutationAccess && (
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-zinc-500">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                SKELETON_ROWS.map((n) => (
                  <tr key={n}>
                    {SKELETON_CELLS.map((c) => (
                      <td key={c} className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-zinc-800" /></td>
                    ))}
                    {hasMutationAccess && <td className="px-4 py-3"><div className="h-4 w-12 animate-pulse rounded bg-zinc-800 ml-auto" /></td>}
                  </tr>
                ))
              ) : filteredTeams.length === 0 ? (
                <tr>
                  <td colSpan={hasMutationAccess ? 9 : 8} className="px-4 py-12 text-center text-sm text-zinc-500">No teams found</td>
                </tr>
              ) : (
                filteredTeams.map((team) => {
                  const checkedIn = team.members.filter((m) => m.attendance?.checkedIn).length;
                  const attendancePercent = team.totalMembers > 0 ? Math.round((checkedIn / team.totalMembers) * 100) : 0;

                  return (
                    <React.Fragment key={team.id}>
                      <tr
                        role="button"
                        tabIndex={0}
                        className={`hover:bg-zinc-800/50 transition-colors cursor-pointer ${team.isArchived ? 'opacity-50' : ''}`}
                        onClick={(e) => toggleExpanded(team.id, e)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleExpanded(team.id, e);
                          }
                        }}
                      >
                        <td className="px-3 py-3">
                          <button className="text-zinc-500 hover:text-zinc-300" tabIndex={-1}>
                            {expandedRows.has(team.id) ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-white">
                          <div className="flex items-center gap-2">
                            {team.teamName}
                            {team.isArchived && <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Archived</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-300">{team.leaderId}</td>
                        <td className="px-4 py-3 text-sm tabular-nums text-zinc-400 whitespace-nowrap w-[120px]">{team.leaderPhone ? formatPhone(team.leaderPhone) : '—'}</td>
                        <td className="px-4 py-3 text-sm text-zinc-300 max-w-[180px] truncate" title={team.eventName || undefined}>{team.eventName || '—'}</td>
                        <td className="px-4 py-3 text-sm tabular-nums text-zinc-400">{team.totalMembers}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${team.paymentStatus === 'success'
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
                        {hasMutationAccess && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={(e) => { e.stopPropagation(); openEdit(team); }}
                                disabled={actionLoading}
                                title="Edit Team Name"
                                className="action-btn flex items-center justify-center p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
                              >
                                <IconEdit size={15} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleToggleArchive(team); }}
                                disabled={actionLoading}
                                title={team.isArchived ? "Unarchive Team" : "Archive Team"}
                                className="action-btn flex items-center justify-center p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
                              >
                                {team.isArchived ? <IconRefresh size={15} /> : <IconArchive size={15} />}
                              </button>
                              {/* If payment status is active/paid, allow revert if needed, maybe using the passId */}
                              {team.passId && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRevertPayment(team.id, team.passId); }}
                                  disabled={actionLoading}
                                  title="Revert Pass Usage"
                                  className="action-btn flex items-center justify-center p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
                                >
                                  <IconRotate size={15} />
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteTeamId(team.id); }}
                                disabled={actionLoading}
                                title="Delete Team"
                                className="action-btn flex items-center justify-center p-1.5 rounded-md text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                              >
                                <IconTrash size={15} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {/* Expanded members */}
                      {expandedRows.has(team.id) && (
                        <tr>
                          <td colSpan={hasMutationAccess ? 9 : 8} className="bg-zinc-950 px-8 py-4">
                            <div className="space-y-1">
                              {team.members.map((m) => (
                                <div key={m.phone || m.name} className="flex items-center gap-4 rounded-lg bg-zinc-900 px-3 py-2 text-sm">
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

      <DeleteConfirmModal
        open={!!deleteTeamId}
        onConfirm={handleDeleteTeam}
        onCancel={() => setDeleteTeamId(null)}
        loading={actionLoading}
      />

      <Sheet open={!!editTeam} onOpenChange={(open) => !open && setEditTeam(null)}>
        <SheetContent className="bg-zinc-900 border-zinc-800 text-white w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-white">Edit Team</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Team Name</Label>
              <Input
                value={editForm.teamName}
                onChange={(e) => setEditForm({ ...editForm, teamName: e.target.value })}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-zinc-700"
                placeholder="Enter new team name"
              />
            </div>
            {editTeam && (
              <div className="mt-6 rounded-lg bg-amber-500/10 p-3 border border-amber-500/20">
                <p className="text-xs text-amber-500 leading-relaxed">
                  Note: Editing advanced elements like members requires recreating a team through the native flow currently. Future updates will support full manual team manipulation. For now, you can edit the Team Name and Toggle Archive statuses!
                </p>
              </div>
            )}
          </div>
          <SheetFooter className="mt-8 flex gap-2">
            <Button
              variant="outline"
              onClick={() => setEditTeam(null)}
              className="w-full border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={saveTeamEdit}
              disabled={actionLoading || !editForm.teamName.trim() || editForm.teamName === editTeam?.teamName}
              className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {actionLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
