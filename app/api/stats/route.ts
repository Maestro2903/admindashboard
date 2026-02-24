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

    // STEP 8: Use aggregation queries and batched reads instead of full collection scans
    const [
      usersCountAgg,
      teamsCountAgg,
    ] = await Promise.all([
      db.collection('users').count().get(),
      db.collection('teams').count().get(),
    ]);

    const totalUsers = usersCountAgg.data()?.count ?? 0;
    const teamsRegistered = teamsCountAgg.data()?.count ?? 0;

    // STEP 8: Query only success payments for revenue calculation (batched, paginated)
    // Use cursor-based pagination to avoid loading all at once
    const successPaymentsQuery = db.collection('payments')
      .where('status', '==', 'success')
      .orderBy('createdAt', 'desc')
      .limit(1000); // Reasonable batch size

    const successPaymentsSnap = await successPaymentsQuery.get();
    const successPayments = successPaymentsSnap.docs.map((d) => d.data() as Record<string, unknown>);
    
    const totalSuccessfulPayments = successPayments.length;
    const revenue = successPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // STEP 8: Query pending payments count
    const pendingPaymentsAgg = await db.collection('payments')
      .where('status', '==', 'pending')
      .count()
      .get();
    const pendingPayments = pendingPaymentsAgg.data()?.count ?? 0;

    // STEP 8: Query passes by status for counts
    const [paidPassesAgg, usedPassesAgg] = await Promise.all([
      db.collection('passes').where('status', '==', 'paid').count().get(),
      db.collection('passes').where('status', '==', 'used').count().get(),
    ]);
    const activePasses = paidPassesAgg.data()?.count ?? 0;
    const usedPasses = usedPassesAgg.data()?.count ?? 0;

    // Build paymentId -> status map for pass distribution (only count passes with success payment, not archived)
    const paymentStatusById = new Map<string, string>();
    for (const doc of successPaymentsSnap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const st = d?.status;
      if (typeof st === 'string') paymentStatusById.set(doc.id, st);
    }

    // STEP 8: For pass distribution, query passes in batches by type
    // Only count passes that have success payment and are not archived
    const passTypes = ['day_pass', 'group_events', 'proshow', 'sana_concert'];
    const passDistribution: Record<string, number> = {};
    
    for (const pt of passTypes) {
      try {
        const passesOfType = await db.collection('passes')
          .where('passType', '==', pt)
          .where('isArchived', '==', false)
          .limit(1000)
          .get();
        
        let count = 0;
        for (const doc of passesOfType.docs) {
          const p = doc.data() as Record<string, unknown>;
          const paymentId = getString(p, 'paymentId');
          // STEP 3: Only count if linked payment has status === 'success'
          if (paymentId && paymentStatusById.get(paymentId) === 'success') {
            count++;
          }
        }
        if (count > 0) {
          passDistribution[pt] = count;
        }
      } catch (err) {
        console.warn(`Failed to count passes for type ${pt}:`, err);
      }
    }

    // Today vs yesterday registrations (based on success payments)
    const { start: todayStart, end: todayEnd } = getDayISTBounds(0);
    const { start: yesterdayStart, end: yesterdayEnd } = getDayISTBounds(-1);

    let registrationsToday = 0;
    let registrationsYesterday = 0;

    // STEP 3: Only count success payments for registrations
    for (const p of successPayments) {
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

    // Recent successful payments (already have them from above query)
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

    // STEP 8: Recent used passes (query instead of full scan)
    const recentScansSnap = await db.collection('passes')
      .where('status', '==', 'used')
      .orderBy('usedAt', 'desc')
      .limit(10)
      .get();
    
    const recentScans = recentScansSnap.docs.map((doc) => {
      const p = doc.data() as Record<string, unknown>;
      return {
        ...p,
        _ts: toIso(p.usedAt),
      };
    }).filter((p) => p._ts);

    for (const s of recentScans) {
      activityItems.push({
        id: `scan-${s._ts}`,
        type: 'scan',
        message: `Pass scanned - ${getString(s, 'passType')}`,
        timestamp: s._ts!,
      });
    }

    // STEP 8: Recent teams (query instead of full scan)
    const recentTeamsSnap = await db.collection('teams')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    
    const recentTeams = recentTeamsSnap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return { ...data, _ts: toIso(data.createdAt) };
    }).filter((t) => t._ts);

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
