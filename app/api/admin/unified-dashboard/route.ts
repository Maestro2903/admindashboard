import { NextRequest } from 'next/server';
import { requireAdminRole, forbiddenRole } from '@/lib/admin/requireAdminRole';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';
import type {
  AdminEvent,
  CleanUnifiedRecordWithId,
  FinancialRecord,
  FinancialDashboardResponse,
  OperationsRecord,
  OperationsDashboardResponse,
  UnifiedDashboardResponse,
} from '@/types/admin';

type DocData = FirebaseFirestore.DocumentData;

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const maybe = value as { toDate?: () => Date };
  if (typeof maybe?.toDate === 'function') return maybe.toDate().toISOString();
  return null;
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

/** Derive a single readable event name for the unified table. */
function deriveEventName(
  passType: string,
  d: Record<string, unknown>,
  teamSnapshot: Record<string, unknown> | null,
  eventNames: string[]
): string {
  const pt = passType.toLowerCase();
  if (pt === 'group_events') {
    const teamName = getString(teamSnapshot ?? {}, 'teamName');
    if (teamName) return teamName;
    return eventNames[0] ?? '—';
  }
  if (pt === 'day_pass') {
    const selectedDay = getString(d, 'selectedDay');
    if (selectedDay) return selectedDay;
    return eventNames[0] ?? '—';
  }
  if (pt === 'proshow') return eventNames[0] ?? '—';
  if (pt === 'sana_concert') return 'Sana Concert';
  return eventNames.length ? eventNames.join(', ') : '—';
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

/** Start and end of current day in IST (UTC+5:30) as Date for Firestore */
function getTodayISTBounds(): { start: Date; end: Date } {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate();
  const start = new Date(Date.UTC(y, m, d) - 5.5 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

async function safeCount(query: FirebaseFirestore.Query<DocData>): Promise<number | undefined> {
  try {
    // Firestore count aggregation is supported on modern SDKs.
    const agg = await query.count().get();
    const data = agg.data?.();
    const count = typeof data?.count === 'number' ? data.count : undefined;
    return count;
  } catch {
    return undefined;
  }
}

export async function GET(req: NextRequest) {
  // CSV exports get stricter rate limit (10/min) vs regular dashboard reads (100/min).
  const isExport = new URL(req.url).searchParams.get('format') === 'csv';
  const rl = await rateLimitAdmin(req, isExport ? 'export' : 'dashboard');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireAdminRole(req);
    if (result instanceof Response) return result;
    const { adminRole } = result;

    const { searchParams } = new URL(req.url);
    const modeParam = (searchParams.get('mode') || '').trim().toLowerCase();
    const mode = modeParam === 'financial' ? 'financial' : 'operations';

    if (mode === 'financial' && adminRole !== 'superadmin') {
      return forbiddenRole();
    }

    const formatCsv = searchParams.get('format') === 'csv';
    const pageSize = formatCsv
      ? clampInt(searchParams.get('pageSize'), 1000, 1, 2000)
      : clampInt(searchParams.get('pageSize'), 50, 1, 100);
    const page = clampInt(searchParams.get('page'), 1, 1, 10_000);
    const cursor = searchParams.get('cursor');

    const passType = (searchParams.get('passType') || '').trim() || null;
    const eventId = (searchParams.get('eventId') || '').trim() || null;
    const q = (searchParams.get('q') || '').trim().toLowerCase() || null;

    const includeMetrics = searchParams.get('includeMetrics') !== '0';
    const fromDate = searchParams.get('from')?.trim() || null;
    const toDate = searchParams.get('to')?.trim() || null;
    const includeArchived = searchParams.get('includeArchived') === '1';

    const db = getAdminFirestore();

    // Primary pagination is pass-based (one record per pass). Success-only filter applied after join.
    let basePassQuery: FirebaseFirestore.Query<DocData> = db.collection('passes');
    if (passType) basePassQuery = basePassQuery.where('passType', '==', passType);
    if (eventId) basePassQuery = basePassQuery.where('selectedEvents', 'array-contains', eventId);
    if (fromDate) {
      const from = new Date(fromDate);
      if (!Number.isNaN(from.getTime())) basePassQuery = basePassQuery.where('createdAt', '>=', from);
    }
    if (toDate) {
      const to = new Date(toDate);
      if (!Number.isNaN(to.getTime())) basePassQuery = basePassQuery.where('createdAt', '<=', to);
    }
    basePassQuery = basePassQuery.orderBy('createdAt', 'desc');

    const scanLimit = Math.min(pageSize * 5, 500);
    let passQuery: FirebaseFirestore.Query<DocData> = basePassQuery;
    if (cursor) {
      const cursorDoc = await db.collection('passes').doc(cursor).get();
      if (cursorDoc.exists) {
        passQuery = passQuery.startAfter(cursorDoc);
      }
    } else if (page > 1) {
      passQuery = passQuery.limit(Math.min(page * pageSize, 1000));
    } else {
      passQuery = passQuery.limit(scanLimit);
    }

    // When financial mode, compute total revenue from all passes matching filters (same as passes page data).
    const totalRevenuePromise =
      mode === 'financial'
        ? (async (): Promise<number> => {
            try {
              const aggSnap = await basePassQuery.limit(10000).get();
              let docs = aggSnap.docs;
              if (!includeArchived) {
                docs = docs.filter((d) => (d.data() as Record<string, unknown>).isArchived !== true);
              }
              const paymentIds = uniqStrings(
                docs.map((d) => getString(d.data() as Record<string, unknown>, 'paymentId') ?? null)
              ).filter(Boolean);
              if (paymentIds.length === 0) return 0;
              const BATCH = 100;
              let total = 0;
              for (let i = 0; i < paymentIds.length; i += BATCH) {
                const batch = paymentIds.slice(i, i + BATCH);
                const paySnaps = await Promise.all(
                  batch.map((id) => db.collection('payments').doc(id).get())
                );
                for (const snap of paySnaps) {
                  if (!snap.exists) continue;
                  const data = snap.data() as Record<string, unknown>;
                  if (data?.status !== 'success') continue;
                  const amt = Number(data?.amount);
                  if (Number.isFinite(amt)) total += amt;
                }
              }
              return total;
            } catch {
              return 0;
            }
          })()
        : Promise.resolve(0);

    const [passSnap, totalRevenue] = await Promise.all([passQuery.get(), totalRevenuePromise]);
    let passDocs = passSnap.docs;
    if (!includeArchived) {
      passDocs = passDocs.filter((d) => (d.data() as Record<string, unknown>).isArchived !== true);
    }

    // If page-based pagination was requested, slice the requested page before joining.
    const slicedPassDocs =
      !cursor && page > 1
        ? passDocs.slice((page - 1) * pageSize, page * pageSize)
        : passDocs;

    const userIds = uniqStrings(
      slicedPassDocs.map((d) => {
        const rec = (d.data() as Record<string, unknown>) ?? {};
        return getString(rec, 'userId') ?? null;
      })
    );
    const paymentIds = uniqStrings(
      slicedPassDocs.map((d) => {
        const rec = (d.data() as Record<string, unknown>) ?? {};
        return getString(rec, 'paymentId') ?? null;
      })
    );

    const selectedEventIds = uniqStrings(
      slicedPassDocs.flatMap((d) => {
        const rec = (d.data() as Record<string, unknown>) ?? {};
        const ids = getStringArray(rec, 'selectedEvents');
        const singleId = getString(rec, 'eventId') ?? getString(rec, 'selectedEvent');
        if (singleId && !ids.includes(singleId)) ids.push(singleId);
        return ids;
      })
    );

    const [userDocs, paymentDocs, eventDocs] = await Promise.all([
      Promise.all(userIds.map((id) => db.collection('users').doc(id).get())),
      Promise.all(paymentIds.map((id) => db.collection('payments').doc(id).get())),
      Promise.all(selectedEventIds.map((id) => db.collection('events').doc(id).get())),
    ]);

    const usersById = new Map<string, Record<string, unknown>>();
    for (const doc of userDocs) if (doc.exists) usersById.set(doc.id, doc.data() as Record<string, unknown>);

    const paymentsById = new Map<string, Record<string, unknown>>();
    for (const doc of paymentDocs) if (doc.exists) paymentsById.set(doc.id, doc.data() as Record<string, unknown>);

    const eventsById = new Map<string, AdminEvent>();
    for (const doc of eventDocs) {
      if (!doc.exists) continue;
      const d = doc.data() as Record<string, unknown>;
      eventsById.set(doc.id, {
        id: doc.id,
        name: getString(d, 'name') ?? getString(d, 'title') ?? doc.id,
        category: getString(d, 'category'),
        type: getString(d, 'type'),
        date: getString(d, 'date'),
        venue: getString(d, 'venue'),
        allowedPassTypes: (() => {
          const v = d.allowedPassTypes;
          return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
        })(),
        isActive: typeof d.isActive === 'boolean' ? d.isActive : undefined,
      });
    }

    type FullRecord = CleanUnifiedRecordWithId & {
      paymentId: string;
      amount: number;
      orderId: string;
    };
    const recordsAll: FullRecord[] = [];
    for (const doc of slicedPassDocs) {
      const d = (doc.data() as Record<string, unknown>) ?? {};
      const userId = getString(d, 'userId') ?? '';
      const user = usersById.get(userId) ?? {};
      const paymentId = getString(d, 'paymentId') ?? '';
      const payment = paymentsById.get(paymentId) ?? {};
      const paymentStatusRaw = typeof payment.status === 'string' ? payment.status : '';
      if (paymentStatusRaw !== 'success') continue;

      const selectedEvents = getStringArray(d, 'selectedEvents');
      const singleEventId = getString(d, 'eventId') ?? getString(d, 'selectedEvent');
      const eventIdsForPass = singleEventId && !selectedEvents.includes(singleEventId)
        ? [...selectedEvents, singleEventId]
        : selectedEvents;
      const eventNames = eventIdsForPass
        .map((id) => eventsById.get(id)?.name ?? id)
        .filter(Boolean);
      const teamSnapshot = asRecord(d.teamSnapshot);
      const passTypeStr = getString(d, 'passType') ?? '';
      const eventName = deriveEventName(passTypeStr, d, teamSnapshot, eventNames);
      const createdAt = toIso(d.createdAt) ?? new Date(0).toISOString();
      const amount = Number((payment as Record<string, unknown>).amount) || 0;
      const orderId =
        getString(payment as Record<string, unknown>, 'orderId') ??
        getString(payment as Record<string, unknown>, 'cashfreeOrderId') ??
        '';

      recordsAll.push({
        passId: doc.id,
        userId,
        paymentId,
        name: getString(user, 'name') ?? '',
        email: getString(user, 'email') ?? '',
        college: getString(user, 'college') ?? '',
        phone: getString(user, 'phone') ?? '',
        eventName,
        passType: passTypeStr,
        paymentStatus: 'success',
        createdAt,
        amount,
        orderId,
      });
    }

    const recordsFiltered = recordsAll.filter((r) => {
      if (q) {
        const hay = `${r.name} ${r.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const recordsSliced = cursor || page === 1 ? recordsFiltered.slice(0, pageSize) : recordsFiltered;

    const financialRecords: FinancialRecord[] =
      mode === 'financial'
        ? recordsSliced.map((r) => ({
            userId: r.userId,
            passId: r.passId,
            paymentId: r.paymentId,
            name: r.name,
            email: r.email,
            college: r.college,
            phone: r.phone,
            eventName: r.eventName,
            passType: r.passType,
            amount: r.amount,
            paymentStatus: r.paymentStatus,
            orderId: r.orderId,
            createdAt: r.createdAt,
          }))
        : [];
    const operationsRecords: OperationsRecord[] =
      mode === 'operations'
        ? recordsSliced.map((r) => ({
            passId: r.passId,
            name: r.name,
            email: r.email,
            college: r.college,
            phone: r.phone,
            eventName: r.eventName,
            passType: r.passType,
            payment: 'Confirmed' as const,
            createdAt: r.createdAt,
          }))
        : [];

    const lastDoc = passDocs[passDocs.length - 1];
    const nextCursor =
      cursor || page === 1
        ? lastDoc && passDocs.length >= scanLimit
          ? lastDoc.id
          : null
        : null;

    let metrics: UnifiedDashboardResponse['metrics'] = undefined;
    if (includeMetrics) {
      const { start: todayStart, end: todayEnd } = getTodayISTBounds();

      const totalSuccessfulRegistrations = await safeCount(
        db.collection('payments').where('status', '==', 'success')
      );

      let registrationsToday: number | undefined;
      try {
        const todayPassesSnap = await db
          .collection('passes')
          .where('createdAt', '>=', todayStart)
          .where('createdAt', '<=', todayEnd)
          .limit(1000)
          .get();
        const todayPaymentIds = uniqStrings(
          todayPassesSnap.docs.map((doc) => getString(doc.data() as Record<string, unknown>, 'paymentId') ?? null)
        );
        let successToday = 0;
        if (todayPaymentIds.length > 0) {
          const todayPayments = await Promise.all(
            todayPaymentIds.map((id) => db.collection('payments').doc(id).get())
          );
          for (const payDoc of todayPayments) {
            if (payDoc.exists && (payDoc.data() as Record<string, unknown>)?.status === 'success') successToday += 1;
          }
        }
        registrationsToday = successToday;
      } catch {
        registrationsToday = undefined;
      }

      let registrationsPerPassType: Record<string, number> | undefined;
      try {
        const successPaymentsSnap = await db
          .collection('payments')
          .where('status', '==', 'success')
          .limit(2000)
          .get();
        const byPassType: Record<string, number> = {};
        for (const doc of successPaymentsSnap.docs) {
          const pt = getString(doc.data() as Record<string, unknown>, 'passType') ?? 'unknown';
          byPassType[pt] = (byPassType[pt] ?? 0) + 1;
        }
        registrationsPerPassType = Object.keys(byPassType).length > 0 ? byPassType : undefined;
      } catch {
        registrationsPerPassType = undefined;
      }

      metrics = {
        totalSuccessfulRegistrations: typeof totalSuccessfulRegistrations === 'number' ? totalSuccessfulRegistrations : undefined,
        registrationsToday,
        registrationsPerPassType,
      };
    }

    if (formatCsv) {
      function escapeCsv(val: unknown): string {
        const s = val == null ? '' : String(val);
        if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      }
      if (mode === 'financial') {
        const headers = [
          'Name',
          'College',
          'Phone',
          'Email',
          'Event',
          'Pass Type',
          'Amount',
          'Payment',
          'Order ID',
          'Registered On',
        ];
        const csvRows = [
          headers,
          ...financialRecords.map((r) => [
            r.name,
            r.college,
            r.phone ?? '',
            r.email,
            r.eventName,
            r.passType,
            r.amount,
            r.paymentStatus,
            r.orderId,
            r.createdAt,
          ]),
        ];
        const csv = csvRows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="registrations.csv"',
          },
        });
      }
      const headers = ['Name', 'College', 'Phone', 'Email', 'Event', 'Pass Type', 'Payment', 'Registered On'];
      const csvRows = [
        headers,
        ...operationsRecords.map((r) => [
          r.name,
          r.college,
          r.phone ?? '',
          r.email,
          r.eventName,
          r.passType,
          r.payment,
          r.createdAt,
        ]),
      ];
      const csv = csvRows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="operations.csv"',
        },
      });
    }

    if (mode === 'financial') {
      const response: FinancialDashboardResponse = {
        records: financialRecords,
        page: cursor ? 1 : page,
        pageSize,
        nextCursor,
        metrics,
        summary: { totalRevenue },
      };
      return Response.json(response);
    }
    const response: OperationsDashboardResponse = {
      records: operationsRecords,
      page: cursor ? 1 : page,
      pageSize,
      nextCursor,
      metrics,
    };
    return Response.json(response);
  } catch (error) {
    console.error('Unified dashboard API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}

