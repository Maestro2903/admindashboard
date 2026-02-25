import { NextRequest, NextResponse } from 'next/server';
import type { DocumentData, Query } from 'firebase-admin/firestore';
import { requireAdminRole } from '@/lib/admin/requireAdminRole';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';
import type { AdminPassRow, AdminPassesResponse, PassType } from '@/types/admin';
import { resolveAdminEventDisplay } from '@/lib/events/eventResolution';

type DocData = DocumentData;

const ALLOWED_TYPES: PassType[] = ['day_pass', 'group_events', 'proshow', 'sana_concert'];

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const maybe = value as { toDate?: () => Date };
  if (typeof maybe?.toDate === 'function') return maybe.toDate().toISOString();
  return null;
}

function getString(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key];
  return typeof v === 'string' ? v : undefined;
}

function getStringArray(rec: Record<string, unknown>, key: string): string[] {
  const v = rec[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function uniqStrings(arr: Array<string | undefined | null>): string[] {
  return [...new Set(arr.map((s) => (s ?? '').trim()).filter(Boolean))];
}

export async function GET(req: NextRequest) {
  try {
    const rl = await rateLimitAdmin(req, 'dashboard');
    if (rl.limited) return rateLimitResponse(rl);

    const result = await requireAdminRole(req);
    if (result instanceof Response) return result;
    const { adminRole } = result;
    const isSuperAdmin = adminRole === 'superadmin';
    const canSeeAmount = adminRole === 'manager' || adminRole === 'superadmin';

    const { searchParams } = new URL(req.url);
    const typeRaw = (searchParams.get('type') ?? '').trim();
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '50', 10) || 50));

    // Treat missing/unknown types as "all" to be resilient to older clients.
    const isAllTypes = !typeRaw || typeRaw === 'all' || !ALLOWED_TYPES.includes(typeRaw as PassType);

    const db = getAdminFirestore();

    // Check what passes exist
    const allPassesSnap = await db.collection('passes').limit(10).get();
    console.log(`[PASSES DEBUG] Total passes in DB: ${allPassesSnap.size}`);
    if (allPassesSnap.size > 0) {
      const sample = allPassesSnap.docs[0].data();
      console.log(`[PASSES DEBUG] Sample pass:`, { 
        passType: sample.passType, 
        isArchived: sample.isArchived,
        paymentId: sample.paymentId 
      });
    }

    // Fetch passes (filter archived locally so we also include older docs
    // that might not have an explicit isArchived flag set)
    let passQuery: Query<DocData> = db.collection('passes');
    if (!isAllTypes) {
      passQuery = passQuery.where('passType', '==', typeRaw as PassType);
    }
    const passSnap = await passQuery.limit(1000).get();

    console.log(
      `[PASSES DEBUG] Found ${passSnap.docs.length} total passes for type: ${
        isAllTypes ? 'ALL' : typeRaw
      }`
    );

    const activePassDocs = passSnap.docs.filter((d) => {
      const data = d.data() as Record<string, unknown>;
      return data.isArchived !== true;
    });

    console.log(
      `[PASSES DEBUG] Active (not archived) passes for type ${isAllTypes ? 'ALL' : typeRaw}: ${
        activePassDocs.length
      }`
    );

    const passDocs = activePassDocs.sort((a, b) => {
      const getTime = (d: typeof a) => {
        const v = (d.data() as Record<string, unknown>)?.createdAt;
        if (v instanceof Date) return v.getTime();
        if (v && typeof (v as { toDate?: () => Date }).toDate === 'function')
          return (v as { toDate: () => Date }).toDate().getTime();
        return 0;
      };
      return getTime(b) - getTime(a);
    });

    // Collect IDs for joins
    const userIds = uniqStrings(
      passDocs.map((d) => getString(d.data() as Record<string, unknown>, 'userId'))
    );
    const paymentIds = uniqStrings(
      passDocs.map((d) => getString(d.data() as Record<string, unknown>, 'paymentId'))
    );
    const teamIds = uniqStrings(
      passDocs
        .filter((d) => getString(d.data() as Record<string, unknown>, 'passType') === 'group_events')
        .map((d) => getString(d.data() as Record<string, unknown>, 'teamId'))
    );

    // Fetch related data
    const [userDocs, paymentDocs, teamDocs] = await Promise.all([
      Promise.all(userIds.map((id) => db.collection('users').doc(id).get())),
      Promise.all(paymentIds.map((id) => db.collection('payments').doc(id).get())),
      teamIds.length > 0 ? Promise.all(teamIds.map((id) => db.collection('teams').doc(id).get())) : Promise.resolve([]),
    ]);

    // Build maps
    const usersById = new Map<string, Record<string, unknown>>();
    userDocs.forEach((doc, i) => {
      if (doc.exists && userIds[i]) usersById.set(userIds[i], doc.data() as Record<string, unknown>);
    });

    const paymentsById = new Map<string, Record<string, unknown>>();
    paymentDocs.forEach((doc, i) => {
      if (doc.exists && paymentIds[i]) paymentsById.set(paymentIds[i], doc.data() as Record<string, unknown>);
    });

    const teamsById = new Map<string, Record<string, unknown>>();
    teamDocs.forEach((doc, i) => {
      if (doc.exists && teamIds[i]) teamsById.set(teamIds[i], doc.data() as Record<string, unknown>);
    });

    // Build rows
    const allRows: AdminPassRow[] = [];
    let totalSold = 0;
    let totalRevenue = 0;
    let totalUsed = 0;

    for (const doc of passDocs) {
      const pass = doc.data() as Record<string, unknown>;
      const passType = (getString(pass, 'passType') as PassType | undefined) ?? 'day_pass';
      const paymentId = getString(pass, 'paymentId') ?? '';
      const payment = paymentsById.get(paymentId);

      if (!payment) {
        console.log(`[PASSES DEBUG] Skipping pass ${doc.id} - no payment found for paymentId: ${paymentId}`);
        continue;
      }

      const teamId = getString(pass, 'teamId');
      const team = teamId ? teamsById.get(teamId) : null;

      // Resolve userId
      const userId = getString(pass, 'userId') ?? getString(payment, 'userId') ?? getString(team ?? {}, 'leaderId') ?? '';
      const user = userId ? usersById.get(userId) : null;

      // Resolve name
      const customerDetails = payment.customerDetails as Record<string, unknown> | undefined;
      const name = getString(user ?? {}, 'name') ??
        getString(payment, 'name') ??
        getString(customerDetails ?? {}, 'customer_name') ??
        getString(customerDetails ?? {}, 'name') ??
        '';

      // Resolve phone
      const phone = getString(user ?? {}, 'phone') ??
        getString(payment, 'phone') ??
        getString(customerDetails ?? {}, 'customer_phone') ??
        getString(customerDetails ?? {}, 'phone') ??
        '';

      // Resolve college
      const college = getString(user ?? {}, 'college') ??
        getString(payment, 'college') ??
        getString(customerDetails ?? {}, 'college') ??
        getString(team ?? {}, 'leaderCollege') ??
        null;

      // Resolve event + day display from canonical admin resolver
      const { eventDisplay, dayDisplay } = resolveAdminEventDisplay({
        pass,
        payment: payment as Record<string, unknown>,
        team: team as Record<string, unknown> | null,
      });

      // Resolve usage
      const scannedCount = typeof pass.scannedCount === 'number' ? pass.scannedCount : 0;
      const isUsed = scannedCount > 0;
      const usedAt = toIso(pass.lastScannedAt) ?? toIso(pass.usedAt);

      const amount = typeof payment.amount === 'number' ? payment.amount : 0;
      const createdAt = toIso(pass.createdAt) ?? '';

      allRows.push({
        id: doc.id,
        userId,
        name,
        phone,
        college,
        passType,
        eventLabel: eventDisplay,
        selectedDay: dayDisplay,
        amount,
        paymentStatus: 'success',
        isUsed,
        usedAt,
        createdAt,
      });

      totalSold += 1;
      totalRevenue += amount;
      if (isUsed) totalUsed += 1;
    }

    console.log(`[PASSES DEBUG] Built ${allRows.length} rows from ${passDocs.length} passes`);

    // Paginate
    const start = (page - 1) * pageSize;
    const data = allRows.slice(start, start + pageSize);
    const hasMore = start + pageSize < allRows.length;

    const summary = {
      totalSold: isSuperAdmin ? totalSold : 0,
      totalRevenue: isSuperAdmin ? totalRevenue : 0,
      totalUsed: isSuperAdmin ? totalUsed : 0,
      usagePercentage: isSuperAdmin && totalSold > 0 ? Math.round((totalUsed / totalSold) * 100) : 0,
    };

    const safeData = canSeeAmount
      ? data
      : data.map((row) => ({ ...row, amount: 0 }));

    const response: AdminPassesResponse = {
      data: safeData,
      summary,
      pagination: {
        page,
        pageSize,
        hasMore,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('ADMIN PASSES ERROR:', error);
    const message = error instanceof Error ? error.message : 'Server error';
    return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 });
  }
}
