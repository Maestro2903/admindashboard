'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { OverviewMetrics } from '@/types/admin';

function MetricCard({
  label,
  value,
  hint,
  loading,
  href,
  compact,
}: {
  label: string;
  value?: number;
  hint?: string;
  loading?: boolean;
  href?: string;
  compact?: boolean;
}) {
  const content = (
    <Card className={`border border-slate-200 bg-white rounded-xl shadow-sm transition hover:bg-slate-50/80 ${compact ? 'p-4' : 'p-6'}`}>
      <CardContent className={compact ? 'space-y-1 p-0' : 'space-y-0 p-0'}>
        <div className="text-sm text-slate-500">{label}</div>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-28 bg-slate-200" />
        ) : (
          <div className={compact ? 'mt-1 text-2xl font-semibold tabular-nums text-slate-900' : 'mt-2 text-3xl font-semibold tabular-nums text-slate-900'}>
            {(value ?? 0).toLocaleString()}
          </div>
        )}
        {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block focus:outline-none focus:ring-2 focus:ring-slate-300 rounded-xl">
        {content}
      </Link>
    );
  }
  return content;
}

export function OverviewCards({
  metrics,
  loading,
}: {
  metrics?: OverviewMetrics;
  loading?: boolean;
}) {
  const perPassType = metrics?.registrationsPerPassType ?? {};
  // Exclude test/sample pass types so only original production pass types are shown.
  const EXCLUDED_PASS_TYPES = ['test_pass'];
  const passTypes = Object.keys(perPassType)
    .filter((pt) => !EXCLUDED_PASS_TYPES.includes(pt) && !/test/i.test(pt))
    .sort((a, b) => a.localeCompare(b));

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Total Successful Registrations"
        value={metrics?.totalSuccessfulRegistrations}
        loading={loading}
        href="/admin/unified"
      />
      <MetricCard
        label="Registrations Today"
        value={metrics?.registrationsToday}
        loading={loading}
        href="/admin/unified"
      />
      {passTypes.map((passType) => (
        <MetricCard
          key={passType}
          label={passType}
          value={perPassType[passType]}
          loading={loading}
          hint="Successful registrations"
          href={`/admin/unified?passType=${encodeURIComponent(passType)}`}
          compact
        />
      ))}
    </div>
  );
}

