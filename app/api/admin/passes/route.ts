import { NextRequest } from 'next/server';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';
import type {
  GroupEventsMember,
  GroupEventsTeam,
  PassManagementRecord,
  PassManagementResponse,
  PassManagementType,
} from '@/types/admin';

type DocData = FirebaseFirestore.DocumentData;

const VALID_TYPES: PassManagementType[] = ['day_pass', 'group_events', 'proshow', 'sana_concert'];

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
  const rl = await rateLimitAdmin(req, 'dashboard');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireOrganizer(req);
    if (result instanceof Response) return result;

    const { searchParams } = new URL(req.url);
    const typeRaw = (searchParams.get('type') ?? '').trim();
    const type = VALID_TYPES.includes(typeRaw as PassManagementType)
      ? (typeRaw as PassManagementType)
      : null;

    if (!type) {
      return Response.json(
        { error: 'Missing or invalid type. Use one of: day_pass, group_events, proshow, sana_concert' },
        { status: 400 }
      );
    }

    const page = clampInt(searchParams.get('page'), 1, 1, 100);
    const pageSize = clampInt(searchParams.get('pageSize'), 50, 1, 100);
    const fromDate = searchParams.get('from')?.trim() || null;
    const toDate = searchParams.get('to')?.trim() || null;
    const includeSummary = searchParams.get('includeSummary') === '1';

    const db = getAdminFirestore();

    let passQuery: FirebaseFirestore.Query<DocData> = db
      .collection('passes')
      .where('passType', '==', type)
      .orderBy('createdAt', 'desc');

    if (fromDate) {
      const from = new Date(fromDate);
      if (!Number.isNaN(from.getTime())) {
        passQuery = passQuery.where('createdAt', '>=', from);
      }
    }
    if (toDate) {
      const to = new Date(toDate);
      if (!Number.isNaN(to.getTime())) {
        passQuery = passQuery.where('createdAt', '<=', to);
      }
    }

    const maxDocs = includeSummary ? 2000 : Math.min(page * pageSize, 500);
    const passSnap = await passQuery.limit(maxDocs).get();

    const passDocs = passSnap.docs.filter((d) => {
      const data = d.data() as Record<string, unknown>;
      return data?.isArchived !== true;
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

      const userId = getString(d, 'userId') ?? '';
      const user = usersById.get(userId) ?? {};
      const amount = Number((payment as Record<string, unknown>).amount) || 0;
      const createdAt = toIso(d.createdAt) ?? '';
      const usedAt = toIso(d.usedAt);
      const passStatus =
        d.status === 'used' || d.usedAt ? ('used' as const) : ('paid' as const);
      const scannedBy = getString(d, 'scannedBy') ?? null;

      // Derive event name
      const selectedEvents = getStringArray(d, 'selectedEvents');
      const singleEventId = getString(d, 'eventId') ?? getString(d, 'selectedEvent');
      const eventIdsForPass = singleEventId && !selectedEvents.includes(singleEventId)
        ? [...selectedEvents, singleEventId]
        : selectedEvents;
      const eventNames = eventIdsForPass
        .map((id) => eventsById.get(id)?.name ?? id)
        .filter(Boolean);
      const teamSnapshot = asRecord(d.teamSnapshot);
      const eventName = deriveEventName(type, d, teamSnapshot, eventNames);

      const base: PassManagementRecord = {
        passId: doc.id,
        paymentId: paymentId || undefined,
        userName: getString(user, 'name') ?? '',
        college: getString(user, 'college') ?? '',
        phone: getString(user, 'phone') ?? '',
        eventName,
        amount,
        paymentStatus: 'success',
        passStatus,
        createdAt,
        usedAt,
        scannedBy,
      };

      if (type === 'group_events') {
        const teamId = getString(d, 'teamId');
        const t = teamId ? teamsById.get(teamId) : null;
        if (t) {
          const members = t.members;
          base.totalMembers =
            getNumber(t, 'totalMembers') ?? (Array.isArray(members) ? members.length : 0);
          base.checkedInCount = countCheckedIn(members);
          base.teamName = getString(t, 'teamName') ?? '';
          const teamPayload = buildGroupEventsTeam(teamId ?? '', t, paymentStatus);
          teamPayload.leaderCollege = getString(user, 'college') ?? '';
          base.team = teamPayload;
        } else {
          const teamSnapshot = d.teamSnapshot as Record<string, unknown> | undefined;
          if (teamSnapshot) {
            base.teamName = getString(teamSnapshot, 'teamName') ?? '';
            base.totalMembers = getNumber(teamSnapshot, 'totalMembers');
            base.checkedInCount = countCheckedIn(teamSnapshot.members);
            base.team = buildGroupEventsTeam(
              teamId ?? '',
              teamSnapshot,
              paymentStatus
            );
            base.team.leaderCollege = getString(user, 'college') ?? '';
          }
        }
      }

      recordsAll.push(base);
    }

    let summary: PassManagementResponse['summary'] | undefined;
    if (includeSummary && recordsAll.length > 0) {
      const totalSold = recordsAll.length;
      const totalRevenue = recordsAll.reduce((s, r) => s + r.amount, 0);
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

    return Response.json(response);
  } catch (error) {
    console.error('Admin passes API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
