import { NextRequest, NextResponse } from 'next/server';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';
import { getEventIdsFromPass } from '@/lib/events/eventResolution';
import type {
  GroupEventsMember,
  GroupEventsTeam,
  PassManagementRecord,
  PassManagementResponse,
  PassManagementType,
} from '@/types/admin';

type DocData = DocumentData;

const ALLOWED_TYPES: PassManagementType[] = ['day_pass', 'group_events', 'proshow', 'sana_concert'];
const MAX_FETCH_LIMIT = 500;

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

function getString(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key];
  return typeof v === 'string' ? v : undefined;
}

function getNumber(rec: Record<string, unknown>, key: string): number | undefined {
  const v = rec[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function uniqStrings(arr: Array<string | undefined | null>): string[] {
  return [...new Set(arr.map((s) => (s ?? '').trim()).filter(Boolean))];
}

function getStringArray(rec: Record<string, unknown>, key: string): string[] {
  const v = rec[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function deriveEventName(
  passType: string,
  d: Record<string, unknown>,
  teamSnapshot: Record<string, unknown> | null,
  eventNames: string[]
): string {
  const pt = passType.toLowerCase();
  if (pt === 'group_events') {
    // Prefer concrete event names derived from event IDs; fall back to team name only if missing.
    if (eventNames.length > 0) return eventNames.join(', ');
    const teamName = getString(teamSnapshot ?? {}, 'teamName');
    if (teamName) return teamName;
    return '—';
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

function countCheckedIn(members: unknown): number {
  if (!Array.isArray(members)) return 0;
  let n = 0;
  for (const m of members) {
    const r = m && typeof m === 'object' ? (m as Record<string, unknown>) : null;
    const att =
      r?.attendance && typeof r.attendance === 'object'
        ? (r.attendance as Record<string, unknown>)
        : null;
    if (att?.checkedIn === true) n += 1;
  }
  return n;
}

function buildGroupEventsMembers(members: unknown): GroupEventsMember[] {
  if (!Array.isArray(members)) return [];
  return members.map((m) => {
    const r = m && typeof m === 'object' ? (m as Record<string, unknown>) : {};
    const att =
      r?.attendance && typeof r.attendance === 'object'
        ? (r.attendance as Record<string, unknown>)
        : null;
    const checkedIn = att?.checkedIn === true;
    const checkInAt = att?.checkedInAt;
    return {
      name: getString(r, 'name') ?? '',
      phone: getString(r, 'phone') ?? '',
      email: getString(r, 'email') ?? null,
      isLeader: Boolean(r.isLeader),
      checkedIn,
      checkInTime: toIso(checkInAt) ?? null,
      checkedInBy: getString(att ?? {}, 'checkedInBy') ?? null,
    };
  });
}

function buildGroupEventsTeam(
  teamId: string,
  t: Record<string, unknown>,
  paymentStatus: string
): GroupEventsTeam {
  const members = (t.members as Array<Record<string, unknown>>) ?? [];
  const totalMembers = getNumber(t, 'totalMembers') ?? members.length;
  const leader = members.find((m) => m.isLeader === true) ?? members[0];
  const leaderName = leader ? getString(leader, 'name') ?? '' : '';
  const leaderPhone = leader ? getString(leader, 'phone') ?? '' : '';
  return {
    teamId,
    teamName: getString(t, 'teamName') ?? '',
    totalMembers,
    leaderName,
    leaderPhone,
    leaderCollege: '', // resolved below when we have usersById for leader
    paymentStatus,
    members: buildGroupEventsMembers(members),
  };
}

export async function GET(req: NextRequest) {
  try {
    const rl = await rateLimitAdmin(req, 'dashboard');
    if (rl.limited) return rateLimitResponse(rl);

    const result = await requireOrganizer(req);
    if (result instanceof Response) return result;

    const { searchParams } = new URL(req.url);
    const typeRaw = (searchParams.get('type') ?? '').trim();

    if (!typeRaw || !ALLOWED_TYPES.includes(typeRaw as PassManagementType)) {
      return NextResponse.json(
        { error: 'Invalid or missing type parameter' },
        { status: 400 }
      );
    }
    const type = typeRaw as PassManagementType;

    const page = clampInt(searchParams.get('page'), 1, 1, 100);
    const pageSize = clampInt(searchParams.get('pageSize'), 50, 1, 100);
    const fromParam = searchParams.get('from')?.trim() || null;
    const toParam = searchParams.get('to')?.trim() || null;
    const eventIdParam = searchParams.get('eventId')?.trim() || null;
    const eventCategoryParam = searchParams.get('eventCategory')?.trim() || null;
    const eventTypeParam = searchParams.get('eventType')?.trim() || null;
    const includeSummary = searchParams.get('includeSummary') === '1';

    let fromDate: Date | null = null;
    let toDate: Date | null = null;
    if (fromParam) {
      const from = new Date(fromParam);
      if (Number.isNaN(from.getTime())) {
        return NextResponse.json(
          { error: 'Invalid from date' },
          { status: 400 }
        );
      }
      fromDate = from;
    }
    if (toParam) {
      const to = new Date(toParam);
      if (Number.isNaN(to.getTime())) {
        return NextResponse.json(
          { error: 'Invalid to date' },
          { status: 400 }
        );
      }
      toDate = to;
    }

    const db = getAdminFirestore();

    // Query by passType only (no orderBy/date in query) to avoid requiring a composite index.
    // We sort and filter by date in memory below.
    let passSnap;
    try {
      passSnap = await db
        .collection('passes')
        .where('passType', '==', type)
        .limit(MAX_FETCH_LIMIT)
        .get();
    } catch (firestoreError: unknown) {
      const err = firestoreError as { message?: string; code?: number; stack?: string };
      const message = err?.message ?? String(firestoreError);
      console.error('ADMIN PASSES ERROR (Firestore):', firestoreError);
      return NextResponse.json(
        { error: 'Failed to load passes', details: message },
        { status: 500 }
      );
    }

    let passDocs = passSnap.docs.filter((d) => {
      const data = d.data() as Record<string, unknown>;
      if (data?.isArchived === true) return false;
      if (eventIdParam) {
        const ids = getEventIdsFromPass(data);
        if (!ids.includes(eventIdParam)) return false;
      }
      if (eventCategoryParam && getString(data, 'eventCategory') !== eventCategoryParam) return false;
      if (eventTypeParam && getString(data, 'eventType') !== eventTypeParam) return false;
      if (fromDate || toDate) {
        const created = data?.createdAt as { toDate?: () => Date } | Date | undefined;
        const createdDate =
          created instanceof Date ? created : typeof created?.toDate === 'function' ? created.toDate() : null;
        if (createdDate) {
          const t = createdDate.getTime();
          if (fromDate && t < fromDate.getTime()) return false;
          if (toDate && t > toDate.getTime()) return false;
        }
      }
      return true;
    });

    // Sort by createdAt descending (newest first)
    passDocs = passDocs.sort((a, b) => {
      const getTime = (d: QueryDocumentSnapshot<DocData>) => {
        const v = (d.data() as Record<string, unknown>)?.createdAt as { toDate?: () => Date } | Date | undefined;
        if (v instanceof Date) return v.getTime();
        if (v && typeof (v as { toDate?: () => Date }).toDate === 'function')
          return (v as { toDate: () => Date }).toDate().getTime();
        return 0;
      };
      return getTime(b) - getTime(a);
    });

    const userIds = uniqStrings(
      passDocs.map((d) => getString(d.data() as Record<string, unknown>, 'userId') ?? null)
    );
    const paymentIds = uniqStrings(
      passDocs.map((d) => getString(d.data() as Record<string, unknown>, 'paymentId') ?? null)
    );

    const teamIds =
      type === 'group_events'
        ? uniqStrings(
            passDocs.map((d) => getString(d.data() as Record<string, unknown>, 'teamId') ?? null)
          )
        : [];

    const selectedEventIds = uniqStrings(
      passDocs.flatMap((d) => {
        const rec = (d.data() as Record<string, unknown>) ?? {};
        const ids = getStringArray(rec, 'selectedEvents');
        const singleId = getString(rec, 'eventId') ?? getString(rec, 'selectedEvent');
        if (singleId && !ids.includes(singleId)) ids.push(singleId);
        return ids;
      })
    );

    const [userDocs, paymentDocs, teamDocs, eventDocs] = await Promise.all([
      Promise.all(userIds.map((id) => db.collection('users').doc(id).get())),
      Promise.all(paymentIds.map((id) => db.collection('payments').doc(id).get())),
      teamIds.length > 0
        ? Promise.all(teamIds.map((id) => db.collection('teams').doc(id).get()))
        : Promise.resolve([]),
      selectedEventIds.length > 0
        ? Promise.all(selectedEventIds.map((id) => db.collection('events').doc(id).get()))
        : Promise.resolve([]),
    ]);

    const usersById = new Map<string, Record<string, unknown>>();
    userDocs.forEach((doc, i) => {
      if (doc.exists && userIds[i]) usersById.set(userIds[i], doc.data() as Record<string, unknown>);
    });

    const paymentsById = new Map<string, Record<string, unknown>>();
    paymentDocs.forEach((doc, i) => {
      if (doc.exists && paymentIds[i])
        paymentsById.set(paymentIds[i], doc.data() as Record<string, unknown>);
    });

    const teamsById = new Map<string, Record<string, unknown>>();
    teamDocs.forEach((doc, i) => {
      if (doc.exists && teamIds[i]) teamsById.set(teamIds[i], doc.data() as Record<string, unknown>);
    });

    // Fetch additional users from payment.userId and team.leaderId
    const additionalUserIds = new Set<string>();
    paymentDocs.forEach((doc) => {
      if (doc.exists) {
        const uid = getString(doc.data() as Record<string, unknown>, 'userId');
        if (uid && !usersById.has(uid)) additionalUserIds.add(uid);
      }
    });
    teamDocs.forEach((doc) => {
      if (doc.exists) {
        const lid = getString(doc.data() as Record<string, unknown>, 'leaderId');
        if (lid && !usersById.has(lid)) additionalUserIds.add(lid);
      }
    });

    if (additionalUserIds.size > 0) {
      const additionalUserDocs = await Promise.all(
        Array.from(additionalUserIds).map((id) => db.collection('users').doc(id).get())
      );
      additionalUserDocs.forEach((doc) => {
        if (doc.exists) usersById.set(doc.id, doc.data() as Record<string, unknown>);
      });
    }

    const eventsById = new Map<string, { name: string }>();
    eventDocs.forEach((doc) => {
      if (!doc.exists) return;
      const d = doc.data() as Record<string, unknown>;
      eventsById.set(doc.id, {
        name: getString(d, 'name') ?? getString(d, 'title') ?? doc.id,
      });
    });

    const recordsAll: PassManagementRecord[] = [];

    for (const doc of passDocs) {
      const d = (doc.data() as Record<string, unknown>) ?? {};
      const paymentId = getString(d, 'paymentId') ?? '';
      const payment = paymentsById.get(paymentId) ?? {};
      const paymentStatus = typeof payment.status === 'string' ? payment.status : '';
      if (paymentStatus !== 'success') continue;

      // STEP 2: Fix user resolution logic
      const teamId = getString(d, 'teamId');
      const team = teamId ? teamsById.get(teamId) : null;
      const userId =
        getString(d, 'userId') ??
        getString(payment as Record<string, unknown>, 'userId') ??
        getString(team ?? {}, 'leaderId') ??
        null;

      const user = userId ? usersById.get(userId) : null;
      const paymentCustomer = asRecord((payment as Record<string, unknown>).customerDetails);

      // STEP 1: Debug logging for missing college
      if (!getString(user ?? {}, 'college')) {
        console.log('[DEBUG] Missing college for pass:', {
          passId: doc.id,
          'pass.userId': getString(d, 'userId'),
          'payment.userId': getString(payment as Record<string, unknown>, 'userId'),
          'team.leaderId': getString(team ?? {}, 'leaderId'),
          'resolved userId': userId,
          'resolved user.college': getString(user ?? {}, 'college'),
        });
      }

      const userName =
        getString(user ?? {}, 'name') ??
        getString(payment as Record<string, unknown>, 'name') ??
        (paymentCustomer
          ? getString(paymentCustomer, 'customer_name') ?? getString(paymentCustomer, 'name')
          : undefined) ??
        '';
      const userPhone =
        getString(user ?? {}, 'phone') ??
        getString(payment as Record<string, unknown>, 'phone') ??
        (paymentCustomer
          ? getString(paymentCustomer, 'customer_phone') ?? getString(paymentCustomer, 'phone')
          : undefined) ??
        '';

      const amount = Number((payment as Record<string, unknown>).amount) || 0;
      const createdAt = toIso(d.createdAt) ?? '';
      const usedAt = toIso(d.usedAt);
      const passStatus =
        d.status === 'used' || d.usedAt ? ('used' as const) : ('paid' as const);
      const scannedBy = getString(d, 'scannedBy') ?? null;

      // Derive event name
      let selectedEvents = getStringArray(d, 'selectedEvents');
      // Fallback: some older passes store selectedEvents only on the payment record
      if (selectedEvents.length === 0 && payment) {
        selectedEvents = getStringArray(payment as Record<string, unknown>, 'selectedEvents');
      }
      const singleEventId = getString(d, 'eventId') ?? getString(d, 'selectedEvent');
      const eventIdsForPass = singleEventId && !selectedEvents.includes(singleEventId)
        ? [...selectedEvents, singleEventId]
        : selectedEvents;
      const eventNames = eventIdsForPass
        .map((id) => eventsById.get(id)?.name ?? id)
        .filter(Boolean);
      const teamSnapshot = asRecord(d.teamSnapshot);
      const eventName = deriveEventName(type, d, teamSnapshot, eventNames);

      // STEP 3: Fix college resolution with proper fallback chain
      const college =
        getString(user ?? {}, 'college') ??
        getString(team ?? {}, 'leaderCollege') ??
        getString(teamSnapshot ?? {}, 'leaderCollege') ??
        '';

      const base: PassManagementRecord = {
        passId: doc.id,
        paymentId: paymentId || undefined,
        userName,
        college,
        phone: userPhone,
        eventName,
        eventNames: eventNames.length > 0 ? eventNames : undefined,
        amount,
        paymentStatus: 'success',
        passStatus,
        createdAt,
        usedAt,
        scannedBy,
      };

      if (type === 'group_events') {
        const t = team;
        if (t) {
          const members = t.members;
          base.totalMembers =
            getNumber(t, 'totalMembers') ?? (Array.isArray(members) ? members.length : 0);
          base.checkedInCount = countCheckedIn(members);
          base.teamName = getString(t, 'teamName') ?? '';
          const teamPayload = buildGroupEventsTeam(teamId ?? '', t, paymentStatus);
          teamPayload.leaderCollege = college;
          base.team = teamPayload;
          // If user info is missing, fall back to team leader details
          if (!base.userName && teamPayload.leaderName) base.userName = teamPayload.leaderName;
          if (!base.phone && teamPayload.leaderPhone) base.phone = teamPayload.leaderPhone;
        } else if (teamSnapshot) {
          base.teamName = getString(teamSnapshot, 'teamName') ?? '';
          base.totalMembers = getNumber(teamSnapshot, 'totalMembers');
          base.checkedInCount = countCheckedIn(teamSnapshot.members);
          base.team = buildGroupEventsTeam(teamId ?? '', teamSnapshot, paymentStatus);
          base.team.leaderCollege = college;
          // Fallback to leader details from snapshot
          if (!base.userName && base.team.leaderName) base.userName = base.team.leaderName;
          if (!base.phone && base.team.leaderPhone) base.phone = base.team.leaderPhone;
        }
      }

      recordsAll.push(base);
    }

    let summary: PassManagementResponse['summary'] | undefined;
    if (includeSummary && recordsAll.length > 0) {
      const totalSold = recordsAll.length;
      const totalRevenue = recordsAll.reduce((s, r) => s + (r.amount ?? 0), 0);
      const totalUsed = recordsAll.filter((r) => r.passStatus === 'used').length;
      summary = {
        totalSold,
        totalRevenue,
        totalUsed,
        remaining: totalSold - totalUsed,
      };
      if (type === 'group_events') {
        summary.totalTeams = totalSold;
        summary.totalParticipants = recordsAll.reduce(
          (s, r) => s + (r.totalMembers ?? 0),
          0
        );
        summary.checkedInCount = recordsAll.reduce(
          (s, r) => s + (r.checkedInCount ?? 0),
          0
        );
      }
    }

    const start = (page - 1) * pageSize;
    const records = recordsAll.slice(start, start + pageSize);

    const response: PassManagementResponse = {
      records,
      page,
      pageSize,
      total: recordsAll.length,
      summary,
    };

    return NextResponse.json(response);
  } catch (error) {
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('ADMIN PASSES ERROR:', error);
    if (stack) console.error(stack);
    const message = error instanceof Error ? error.message : 'Server error';
    if (
      typeof message === 'string' &&
      (message.includes('index') || message.includes('requires an index'))
    ) {
      return NextResponse.json(
        {
          error: 'Firestore index required. Deploy indexes: firebase deploy --only firestore:indexes',
          details: message,
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
