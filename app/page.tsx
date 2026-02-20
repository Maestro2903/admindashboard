'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import type { OverviewStats, ActivityFeedItem } from '@/types/admin';

function MetricCard({
  label,
  value,
  prefix,
  growth,
  loading,
}: {
  label: string;
  value: number;
  prefix?: string;
  growth?: number;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 fade-in">
      <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      {loading ? (
        <div className="mt-3 h-8 w-24 animate-pulse rounded bg-zinc-800" />
      ) : (
        <div className="mt-2 flex items-end gap-2">
          <span className="text-3xl font-semibold tabular-nums text-white">
            {prefix}{value.toLocaleString('en-IN')}
          </span>
          {growth !== undefined && growth !== 0 && (
            <span
              className={`mb-1 text-xs font-medium ${
                growth > 0 ? 'text-emerald-500' : 'text-red-500'
              }`}
            >
              {growth > 0 ? '+' : ''}{growth}% vs yesterday
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PassDistributionBar({
  distribution,
  loading,
}: {
  distribution: Record<string, number>;
  loading?: boolean;
}) {
  const entries = Object.entries(distribution)
    .filter(([key]) => !/test/i.test(key))
    .sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, v]) => v), 1);

  const COLORS: Record<string, string> = {
    day_pass: 'bg-blue-500',
    group_events: 'bg-emerald-500',
    proshow: 'bg-purple-500',
    sana_concert: 'bg-amber-500',
  };

  const LABELS: Record<string, string> = {
    day_pass: 'Day Pass',
    group_events: 'Group Events',
    proshow: 'Proshow',
    sana_concert: 'Sana Concert',
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 fade-in">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-4">
        Pass Distribution
      </h3>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-zinc-800" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-zinc-500">No data</p>
      ) : (
        <div className="space-y-3">
          {entries.map(([passType, count]) => (
            <div key={passType}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-zinc-300">{LABELS[passType] ?? passType}</span>
                <span className="tabular-nums text-zinc-400 font-medium">{count}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${COLORS[passType] ?? 'bg-zinc-500'}`}
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityFeed({
  items,
  loading,
}: {
  items: ActivityFeedItem[];
  loading?: boolean;
}) {
  const dateFmt = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const TYPE_DOT: Record<string, string> = {
    scan: 'bg-emerald-500',
    payment: 'bg-blue-500',
    team: 'bg-purple-500',
    pass: 'bg-amber-500',
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 fade-in">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-4">
        Live Activity Feed
      </h3>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-4 w-4 animate-pulse rounded-full bg-zinc-800" />
              <div className="h-4 flex-1 animate-pulse rounded bg-zinc-800" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">No recent activity</p>
      ) : (
        <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-zinc-800/50 transition-colors"
            >
              <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${TYPE_DOT[item.type] ?? 'bg-zinc-500'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-300 truncate">{item.message}</p>
                <p className="text-[11px] text-zinc-600 tabular-nums">
                  {dateFmt.format(new Date(item.timestamp))}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OverviewPage() {
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [activity, setActivity] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const token = await user.getIdToken();
      const res = await fetch('/api/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed: ${res.status}`);
      }
      const data = await res.json();
      setStats(data.stats);
      setActivity(data.activity ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchData();
  }, [authLoading, user, fetchData]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (authLoading || !user) return;
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [authLoading, user, fetchData]);

  const growthPercent =
    stats && stats.registrationsYesterday > 0
      ? Math.round(
          ((stats.registrationsToday - stats.registrationsYesterday) /
            stats.registrationsYesterday) *
            100
        )
      : undefined;

  if (error && !stats) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-white">Overview</h1>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm font-medium text-red-400">Failed to load dashboard</p>
          <p className="mt-1 text-sm text-red-400/70">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Overview</h1>
        <p className="text-sm text-zinc-500 mt-1">Event operations control panel</p>
      </div>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Successful Payments"
          value={stats?.totalSuccessfulPayments ?? 0}
          loading={loading}
        />
        <MetricCard
          label="Revenue"
          value={stats?.revenue ?? 0}
          prefix="₹"
          loading={loading}
        />
        <MetricCard
          label="Active Passes"
          value={stats?.activePasses ?? 0}
          loading={loading}
        />
        <MetricCard
          label="Used Passes"
          value={stats?.usedPasses ?? 0}
          loading={loading}
        />
        <MetricCard
          label="Pending Payments"
          value={stats?.pendingPayments ?? 0}
          loading={loading}
        />
        <MetricCard
          label="Teams Registered"
          value={stats?.teamsRegistered ?? 0}
          loading={loading}
        />
      </div>

      {/* Today's registrations with growth */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MetricCard
          label="Registrations Today"
          value={stats?.registrationsToday ?? 0}
          growth={growthPercent}
          loading={loading}
        />
        <MetricCard
          label="Total Users"
          value={stats?.totalUsers ?? 0}
          loading={loading}
        />
      </div>

      {/* Second Section: Pass Distribution + Activity Feed */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PassDistributionBar
          distribution={stats?.passDistribution ?? {}}
          loading={loading}
        />
        <ActivityFeed items={activity} loading={loading} />
      </div>
    </div>
  );
}
