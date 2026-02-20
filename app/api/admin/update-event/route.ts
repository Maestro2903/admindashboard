import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { requireAdminRole, canMutateUsersPaymentsEvents, forbiddenRole } from '@/lib/admin/requireAdminRole';
import { logAdminAction } from '@/lib/admin/adminLogger';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

const bodySchema = z.object({
  eventId: z.string().min(1),
  isActive: z.boolean().optional(),
  venue: z.string().optional(),
  allowedPassTypes: z.array(z.string()).optional(),
  date: z.string().optional(),
  registrationOpen: z.boolean().optional(),
  name: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const rl = await rateLimitAdmin(req, 'mutation');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireAdminRole(req);
    if (result instanceof Response) return result;
    if (!canMutateUsersPaymentsEvents(result.adminRole)) return forbiddenRole();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const parse = bodySchema.safeParse(body);
    if (!parse.success) {
      return Response.json({ error: 'Validation failed', issues: parse.error.issues }, { status: 400 });
    }
    const { eventId, isActive, venue, allowedPassTypes, date, registrationOpen, name } = parse.data;

    const db = getAdminFirestore();
    const eventRef = db.collection('events').doc(eventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }

    const previousData = eventSnap.data() as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof isActive === 'boolean') updates.isActive = isActive;
    if (venue !== undefined) updates.venue = venue;
    if (allowedPassTypes !== undefined) updates.allowedPassTypes = allowedPassTypes;
    if (date !== undefined) updates.date = date;
    if (typeof registrationOpen === 'boolean') updates.registrationOpen = registrationOpen;
    if (name !== undefined) updates.name = name;

    await eventRef.update(updates);
    const newSnap = await eventRef.get();
    const newData = newSnap.data() as Record<string, unknown>;

    const ipAddress = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined;
    const ip = typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : undefined;
    await logAdminAction(db, {
      adminId: result.uid,
      action: 'update-event',
      targetCollection: 'events',
      targetId: eventId,
      previousData,
      newData,
      ipAddress: ip,
    });

    return Response.json({
      success: true,
      eventId,
      isActive: newData.isActive,
      isArchived: newData.isArchived ?? false,
    });
  } catch (error) {
    console.error('Update event API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
