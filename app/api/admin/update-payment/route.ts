import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { requireAdminRole, canMutateUsersPaymentsEvents, forbiddenRole } from '@/lib/admin/requireAdminRole';
import { logAdminAction } from '@/lib/admin/adminLogger';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

const bodySchema = z.object({
  paymentId: z.string().min(1),
  status: z.enum(['pending', 'success', 'failed']).optional(),
  note: z.string().optional(),
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
    const { paymentId, status, note, isArchived } = parse.data;

    const db = getAdminFirestore();
    const paymentRef = db.collection('payments').doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) {
      return Response.json({ error: 'Payment not found' }, { status: 404 });
    }

    const previousData = paymentSnap.data() as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status !== undefined) updates.status = status;
    if (note !== undefined) updates.adminNote = note;
    if (typeof isArchived === 'boolean') {
      updates.isArchived = isArchived;
      updates.archivedAt = isArchived ? new Date() : null;
      updates.archivedBy = isArchived ? result.uid : null;
    }

    await paymentRef.update(updates);
    const newSnap = await paymentRef.get();
    const newData = newSnap.data() as Record<string, unknown>;

    const ipAddress = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined;
    const ip = typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : undefined;
    await logAdminAction(db, {
      adminId: result.uid,
      action: 'update-payment',
      targetCollection: 'payments',
      targetId: paymentId,
      previousData,
      newData,
      ipAddress: ip,
    });

    return Response.json({
      success: true,
      paymentId,
      status: newData.status,
      isArchived: newData.isArchived ?? false,
    });
  } catch (error) {
    console.error('Update payment API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
