import { NextRequest } from 'next/server';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

function getString(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key];
  return typeof v === 'string' ? v : undefined;
}

function escapeCsv(val: unknown): string {
  const s = val == null ? '' : String(val);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const rl = await rateLimitAdmin(req, 'export');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireOrganizer(req);
    if (result instanceof Response) return result;

    const { eventId } = await params;
    if (!eventId) {
      return Response.json({ error: 'Missing eventId' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const eventSnap = await db.collection('events').doc(eventId).get();
    if (!eventSnap.exists) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }

    const passesBySelectedSnap = await db
      .collection('passes')
      .where('selectedEvents', 'array-contains', eventId)
      .get();
    type PassDoc = (typeof passesBySelectedSnap.docs)[number];
    const passDocsById = new Map<string, PassDoc>();
    for (const doc of passesBySelectedSnap.docs) passDocsById.set(doc.id, doc);
    try {
      const passesByEventIdsSnap = await db
        .collection('passes')
        .where('eventIds', 'array-contains', eventId)
        .get();
      for (const doc of passesByEventIdsSnap.docs) if (!passDocsById.has(doc.id)) passDocsById.set(doc.id, doc);
    } catch {
      // eventIds index may not exist yet
    }
    const passDocs = [...passDocsById.values()];

    const userIds = [...new Set(passDocs.map((d) => getString(d.data() as Record<string, unknown>, 'userId')).filter(Boolean))] as string[];
    const userDocs = await Promise.all(userIds.map((id) => db.collection('users').doc(id).get()));
    const usersById = new Map<string, Record<string, unknown>>();
    userDocs.forEach((doc, i) => {
      if (doc.exists && userIds[i]) usersById.set(userIds[i], doc.data() as Record<string, unknown>);
    });

    const headers = ['Name', 'Email', 'College', 'Phone', 'Pass Type', 'Pass Status', 'Team Name', 'Registered At'];
    const rows: string[][] = [headers];

    for (const doc of passDocs) {
      const d = doc.data() as Record<string, unknown>;
      const userId = getString(d, 'userId') ?? '';
      const user = usersById.get(userId) ?? {};
      const createdAt = d.createdAt;
      let createdStr = '';
      if (createdAt) {
        const maybe = createdAt as { toDate?: () => Date };
        createdStr = typeof maybe.toDate === 'function' ? maybe.toDate().toISOString() : String(createdAt);
      }
      const status = d.status === 'used' || d.usedAt ? 'used' : 'paid';
      const teamSnapshot = d.teamSnapshot as Record<string, unknown> | undefined;
      const teamName = teamSnapshot ? getString(teamSnapshot, 'teamName') : undefined;

      rows.push([
        getString(user, 'name') ?? '',
        getString(user, 'email') ?? '',
        getString(user, 'college') ?? '',
        getString(user, 'phone') ?? '',
        getString(d, 'passType') ?? '',
        status,
        teamName ?? '',
        createdStr,
      ]);
    }

    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
    const eventName = getString(eventSnap.data() as Record<string, unknown>, 'name') ?? eventId;
    const filename = `event-${eventName.replace(/[^a-z0-9]/gi, '-')}-registrations.csv`;

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Event export API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
