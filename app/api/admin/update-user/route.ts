import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { requireAdminRole, canMutateUsersPaymentsEvents, forbiddenRole } from '@/lib/admin/requireAdminRole';
import { logAdminAction } from '@/lib/admin/adminLogger';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

const bodySchema = z.object({
  userId: z.string().min(1),
  isOrganizer: z.boolean().optional(),
  phone: z.string().optional(),
  college: z.string().optional(),
  name: z.string().optional(),
  isArchived: z.boolean().optional(),
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
    const { userId, isOrganizer, phone, college, name, isArchived } = parse.data;

    const db = getAdminFirestore();
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const previousData = userSnap.data() as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof isOrganizer === 'boolean') updates.isOrganizer = isOrganizer;
    if (phone !== undefined) updates.phone = phone;
    if (college !== undefined) updates.college = college;
    if (name !== undefined) updates.name = name;
    if (typeof isArchived === 'boolean') {
      updates.isArchived = isArchived;
      updates.archivedAt = isArchived ? new Date() : null;
      updates.archivedBy = isArchived ? result.uid : null;
    }

    await userRef.update(updates);
    const newSnap = await userRef.get();
    const newData = newSnap.data() as Record<string, unknown>;

    const ipAddress = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined;
    const ip = typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : undefined;
    await logAdminAction(db, {
      adminId: result.uid,
      action: 'update-user',
      targetCollection: 'users',
      targetId: userId,
      previousData,
      newData,
      ipAddress: ip,
    });

    return Response.json({
      success: true,
      userId,
      isOrganizer: newData.isOrganizer,
      phone: newData.phone,
      college: newData.college,
      name: newData.name,
      isArchived: newData.isArchived ?? false,
    });
  } catch (error) {
    console.error('Update user API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
