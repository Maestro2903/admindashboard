import { NextRequest } from 'next/server';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import type { OverviewStats, ActivityFeedItem } from '@/types/admin';

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const maybe = value as { toDate?: () => Date };
  if (typeof maybe?.toDate === 'function') return maybe.toDate().toISOString();
  return null;
}

function getString(rec: Record<string, unknown>, key: string): string {
  const v = rec[key];
  return typeof v === 'string' ? v : '';
}

/** Get start/end of a day in IST (UTC+5:30) */
function getDayISTBounds(offsetDays = 0): { start: Date; end: Date } {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate() + offsetDays;
  const start = new Date(Date.UTC(y, m, d) - 5.5 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

export async function GET(req: NextRequest) {
  try {
    const result = await requireOrganizer(req);
    if (result instanceof Response) return result;

    const db = getAdminFirestore();

    // Parallel collection reads for stats
    const [
      paymentsSnap,
      passesSnap,
      teamsSnap,
      usersCountAgg,
    ] = await Promise.all([
      db.collection('payments').get(),
      db.collection('passes').get(),
      db.collection('teams').get(),
      db.collection('users').count().get(),
    ]);

    const payments = paymentsSnap.docs.map((d) => d.data() as Record<string, unknown>);
    const passes = passesSnap.docs.map((d) => d.data() as Record<string, unknown>);

    // Core metrics
    const successPayments = payments.filter((p) => p.status === 'success');
    const totalSuccessfulPayments = successPayments.length;
    const revenue = successPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const pendingPayments = payments.filter((p) => p.status === 'pending').length;

    // Build paymentId -> status map for pass distribution (only count passes with success payment, not archived)
    const paymentStatusById = new Map<string, string>();
    for (const doc of paymentsSnap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const st = d?.status;
      if (typeof st === 'string') paymentStatusById.set(doc.id, st);
    }

    const activePasses = passes.filter((p) => p.status === 'paid').length;
    const usedPasses = passes.filter((p) => p.status === 'used').length;
    const teamsRegistered = teamsSnap.size;
    const totalUsers = usersCountAgg.data()?.count ?? 0;

    // Pass distribution: only count passes that have success payment and are not archived (matches admin passes list)
    const passDistribution: Record<string, number> = {};
    for (const p of passes) {
      if (p.isArchived === true) continue;
      const paymentId = getString(p, 'paymentId');
      if (paymentId && paymentStatusById.get(paymentId) !== 'success') continue;
      const pt = getString(p, 'passType');
      if (pt && !/test/i.test(pt)) {
        passDistribution[pt] = (passDistribution[pt] ?? 0) + 1;
      }
    }

    // Today vs yesterday registrations
    const { start: todayStart, end: todayEnd } = getDayISTBounds(0);
    const { start: yesterdayStart, end: yesterdayEnd } = getDayISTBounds(-1);

    let registrationsToday = 0;
    let registrationsYesterday = 0;

    for (const p of payments) {
      if (p.status !== 'success') continue;
      const createdAt = toIso(p.createdAt);
      if (!createdAt) continue;
      const date = new Date(createdAt);
      if (date >= todayStart && date <= todayEnd) registrationsToday++;
      if (date >= yesterdayStart && date <= yesterdayEnd) registrationsYesterday++;
    }

    const stats: OverviewStats = {
      totalSuccessfulPayments,
      revenue,
      activePasses,
      usedPasses,
      pendingPayments,
      teamsRegistered,
      totalUsers,
      registrationsToday,
      registrationsYesterday,
      passDistribution,
    };

    // Activity feed: recent events (last 20)
    const activityItems: ActivityFeedItem[] = [];

    // Recent successful payments
    const recentPayments = successPayments
      .map((p) => ({
        ...p,
        _ts: toIso(p.createdAt),
      }))
      .filter((p) => p._ts)
      .sort((a, b) => new Date(b._ts!).getTime() - new Date(a._ts!).getTime())
      .slice(0, 10);

    for (const p of recentPayments) {
      activityItems.push({
        id: `pay-${p._ts}`,
        type: 'payment',
        message: `Payment success - ${getString(p, 'passType')} - ₹${Number((p as Record<string, unknown>).amount) || 0}`,
        timestamp: p._ts!,
      });
    }

    // Recent used passes (scans)
    const recentScans = passes
      .filter((p) => p.status === 'used' && p.usedAt)
      .map((p) => ({
        ...p,
        _ts: toIso(p.usedAt),
      }))
      .filter((p) => p._ts)
      .sort((a, b) => new Date(b._ts!).getTime() - new Date(a._ts!).getTime())
      .slice(0, 10);

    for (const s of recentScans) {
      activityItems.push({
        id: `scan-${s._ts}`,
        type: 'scan',
        message: `Pass scanned - ${getString(s, 'passType')}`,
        timestamp: s._ts!,
      });
    }

    // Recent teams
    const recentTeams = teamsSnap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        return { ...data, _ts: toIso(data.createdAt) };
      })
      .filter((t) => t._ts)
      .sort((a, b) => new Date(b._ts!).getTime() - new Date(a._ts!).getTime())
      .slice(0, 5);

    for (const t of recentTeams) {
      activityItems.push({
        id: `team-${t._ts}`,
        type: 'team',
        message: `Team created - ${getString(t, 'teamName')}`,
        timestamp: t._ts!,
      });
    }

    // Sort all activity by timestamp descending
    activityItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return Response.json({
      stats,
      activity: activityItems.slice(0, 20),
    });
  } catch (error) {
    console.error('Admin stats API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
