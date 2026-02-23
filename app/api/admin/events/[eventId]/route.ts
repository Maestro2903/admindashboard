import { NextRequest } from 'next/server';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import type { AdminEvent } from '@/types/admin';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

function getString(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key];
  return typeof v === 'string' ? v : undefined;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const rl = await rateLimitAdmin(req, 'dashboard');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireOrganizer(req);
    if (result instanceof Response) return result;

    const { eventId } = await params;
    if (!eventId) {
      return Response.json({ error: 'Missing eventId' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const eventRef = db.collection('events').doc(eventId);
    const eventSnap = await eventRef.get();

    if (!eventSnap.exists) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventData = eventSnap.data() as Record<string, unknown>;
    const event: AdminEvent = {
      id: eventSnap.id,
      name: getString(eventData, 'name') ?? eventSnap.id,
      category: getString(eventData, 'category'),
      type: getString(eventData, 'type'),
      date: getString(eventData, 'date'),
      venue: getString(eventData, 'venue'),
      allowedPassTypes: Array.isArray(eventData.allowedPassTypes)
        ? (eventData.allowedPassTypes as string[]).filter((x) => typeof x === 'string')
        : undefined,
      isActive: typeof eventData.isActive === 'boolean' ? eventData.isActive : undefined,
    };

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
      // eventIds index may not exist yet; selectedEvents is sufficient for legacy
    }

    const totalRegistrations = passDocsById.size;
    let totalCheckIns = 0;
    const teamIds = new Set<string>();

    for (const doc of passDocsById.values()) {
      const d = doc.data() as Record<string, unknown>;
      if (d.status === 'used' || d.usedAt) totalCheckIns += 1;
      const tid = getString(d, 'teamId');
      if (tid) teamIds.add(tid);
    }

    const remainingExpected = totalRegistrations - totalCheckIns;
    const checkInPercentage =
      totalRegistrations > 0 ? Math.round((totalCheckIns / totalRegistrations) * 100) : 0;

    return Response.json({
      event,
      metrics: {
        totalRegistrations,
        totalCheckIns,
        teamCount: teamIds.size,
        remainingExpected,
        checkInPercentage,
      },
    });
  } catch (error) {
    console.error('Event detail API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
