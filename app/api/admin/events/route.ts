import { NextRequest } from 'next/server';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import type { AdminEvent } from '@/types/admin';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

export async function GET(req: NextRequest) {
  const rl = await rateLimitAdmin(req, 'dashboard');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireOrganizer(req);
    if (result instanceof Response) return result;

    const { searchParams } = new URL(req.url);
    const activeOnlyParam = searchParams.get('activeOnly');
    const activeOnly = activeOnlyParam === null ? true : activeOnlyParam !== '0';
    const includeArchived = searchParams.get('includeArchived') === '1';

    const db = getAdminFirestore();

    // Avoid composite-index requirements (isActive + orderBy name) by sorting in memory.
    let query = activeOnly
      ? db.collection('events').where('isActive', '==', true)
      : db.collection('events').orderBy('name', 'asc');

    const snap = await query.get();
    let docs = snap.docs;
    if (!includeArchived) {
      docs = docs.filter((doc) => (doc.data() as Record<string, unknown>).isArchived !== true);
    }
    const events: AdminEvent[] = docs.map((doc) => {
      const d = doc.data() as Record<string, unknown>;
      const rawTeamConfig = d.teamConfig as Record<string, unknown> | undefined;
      let teamConfig: AdminEvent['teamConfig'] | undefined;
      if (rawTeamConfig && typeof rawTeamConfig === 'object') {
        const min = typeof rawTeamConfig.minMembers === 'number' ? rawTeamConfig.minMembers : undefined;
        const max = typeof rawTeamConfig.maxMembers === 'number' ? rawTeamConfig.maxMembers : undefined;
        const price = typeof rawTeamConfig.pricePerPerson === 'number' ? rawTeamConfig.pricePerPerson : undefined;
        if (min !== undefined && max !== undefined && price !== undefined) {
          teamConfig = { minMembers: min, maxMembers: max, pricePerPerson: price };
        }
      }
      return {
        id: doc.id,
        name: String(d.name ?? doc.id),
        category: typeof d.category === 'string' ? d.category : undefined,
        type: typeof d.type === 'string' ? d.type : undefined,
        date: typeof d.date === 'string' ? d.date : undefined,
        dates: Array.isArray(d.dates) ? (d.dates.filter((x) => typeof x === 'string') as string[]) : undefined,
        venue: typeof d.venue === 'string' ? d.venue : undefined,
        allowedPassTypes: Array.isArray(d.allowedPassTypes)
          ? (d.allowedPassTypes.filter((x) => typeof x === 'string') as string[])
          : undefined,
        isActive: typeof d.isActive === 'boolean' ? d.isActive : undefined,
        isArchived: d.isArchived === true,
        teamConfig,
        startTime: typeof d.startTime === 'string' ? d.startTime : undefined,
        endTime: typeof d.endTime === 'string' ? d.endTime : undefined,
      };
    });

    events.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return Response.json({ events, count: events.length });
  } catch (error) {
    console.error('Admin events API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}

