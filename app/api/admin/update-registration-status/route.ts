import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { requireAdminRole, forbiddenRole } from '@/lib/admin/requireAdminRole';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';
import type { RegistrationStatus } from '@/types/admin';
import { logAdminAction } from '@/lib/admin/adminLogger';

const bodySchema = z.object({
  registrationId: z.string().min(1),
  status: z.enum(['pending', 'converted', 'cancelled']),
});

export async function POST(req: NextRequest) {
  const rl = await rateLimitAdmin(req, 'mutation');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const ctx = await requireAdminRole(req);
    if (ctx instanceof Response) return ctx;

    // Allow managers (editors) and superadmins to change registration status.
    if (ctx.adminRole !== 'manager' && ctx.adminRole !== 'superadmin') {
      return forbiddenRole();
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: 'Validation failed', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { registrationId, status } = parsed.data;
    const db = getAdminFirestore();
    const regRef = db.collection('registrations').doc(registrationId);
    const snap = await regRef.get();
    if (!snap.exists) {
      return Response.json({ error: 'Registration not found' }, { status: 404 });
    }

    const previousData = snap.data() as Record<string, unknown>;

    await regRef.update({
      status: status as RegistrationStatus,
      statusUpdatedAt: new Date(),
      statusUpdatedBy: ctx.uid,
      updatedAt: new Date(),
    });

    const newSnap = await regRef.get();
    const newData = newSnap.data() as Record<string, unknown>;

    const ipHeader =
      req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined;
    const ip =
      typeof ipHeader === 'string' ? ipHeader.split(',')[0].trim() : undefined;

    await logAdminAction(db, {
      adminId: ctx.uid,
      action: 'update-registration-status',
      targetCollection: 'registrations',
      targetId: registrationId,
      previousData,
      newData,
      ipAddress: ip,
    });

    return Response.json({
      success: true,
      registrationId,
      status: newData.status,
    });
  } catch (error) {
    console.error('Update registration status API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}

