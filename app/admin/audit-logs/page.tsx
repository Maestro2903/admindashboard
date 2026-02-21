'use client';

import * as React from 'react';
import { useMemo, useState } from 'react';

import { useAuth } from '@/features/auth/AuthContext';
import { useAuditLogs } from '@/hooks/use-audit-logs';
import { Input } from '@/components/ui/input';
import { IconSearch } from '@tabler/icons-react';

const ACTION_COLORS: Record<string, string> = {
  markUsed: 'bg-emerald-500/10 text-emerald-400',
  revertUsed: 'bg-amber-500/10 text-amber-400',
  delete: 'bg-red-500/10 text-red-400',
  softDelete: 'bg-red-500/10 text-red-400',
  forceVerifyPayment: 'bg-blue-500/10 text-blue-400',
  updatePass: 'bg-blue-500/10 text-blue-400',
  updateUser: 'bg-purple-500/10 text-purple-400',
  updatePayment: 'bg-purple-500/10 text-purple-400',
  updateTeam: 'bg-purple-500/10 text-purple-400',
};

const SKELETON_ROWS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const SKELETON_CELLS = [1, 2, 3, 4, 5, 6] as const;

export default function AuditLogsPage() {
  const { user, loading: authLoading } = useAuth();
  const { logs, loading, error } = useAuditLogs(user, authLoading);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
    []
  );

  const filteredLogs = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter((l) =>
      l.action.toLowerCase().includes(q) ||
      l.targetCollection.toLowerCase().includes(q) ||
      l.targetId.toLowerCase().includes(q) ||
      l.adminId.toLowerCase().includes(q)
    );
  }, [logs, search]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4 fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-white">Audit Logs</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Admin action history</p>
      </div>

      <div className="relative max-w-md">
        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <Input
          placeholder="Search by action, collection, or admin..."
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

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Timestamp</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Action</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Collection</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Target ID</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">Admin</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                SKELETON_ROWS.map((n) => (
                  <tr key={n}>
                    {SKELETON_CELLS.map((c) => (
                      <td key={c} className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-zinc-800" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-zinc-500">No audit logs found</td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr
                      role="button"
                      tabIndex={0}
                      className="hover:bg-zinc-800/50 transition-colors cursor-pointer"
                      onClick={() => toggleExpanded(log.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleExpanded(log.id);
                        }
                      }}
                    >
                      <td className="px-4 py-3 text-sm tabular-nums text-zinc-400 whitespace-nowrap">
                        {dateFmt.format(new Date(log.timestamp))}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[log.action] ?? 'bg-zinc-800 text-zinc-400'}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-300">{log.targetCollection}</td>
                      <td className="px-4 py-3 text-sm font-mono text-zinc-400">{log.targetId.slice(0, 12)}</td>
                      <td className="px-4 py-3 text-sm font-mono text-zinc-400">{log.adminId.slice(0, 12)}</td>
                      <td className="px-4 py-3 text-sm text-zinc-500">{log.ipAddress || '—'}</td>
                    </tr>
                    {expandedIds.has(log.id) && (log.previousData || log.newData) && (
                      <tr>
                        <td colSpan={6} className="bg-zinc-950 px-6 py-4">
                          <div className="grid grid-cols-2 gap-4">
                            {log.previousData && (
                              <div>
                                <h4 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-2">Previous Data</h4>
                                <pre className="text-xs text-zinc-400 bg-zinc-900 rounded-lg p-3 overflow-x-auto max-h-40">
                                  {JSON.stringify(log.previousData, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.newData && (
                              <div>
                                <h4 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-2">New Data</h4>
                                <pre className="text-xs text-zinc-400 bg-zinc-900 rounded-lg p-3 overflow-x-auto max-h-40">
                                  {JSON.stringify(log.newData, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-zinc-800 px-4 py-3">
          <span className="text-xs text-zinc-500">{filteredLogs.length} log entries</span>
        </div>
      </div>
    </div>
  );
}
