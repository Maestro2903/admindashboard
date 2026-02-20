import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { requireAdminRole, canMutatePasses, forbiddenRole } from '@/lib/admin/requireAdminRole';
import { logAdminAction } from '@/lib/admin/adminLogger';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';
import { createQRPayload } from '@/features/passes/qrService';
import QRCode from 'qrcode';

const bodySchema = z.object({
  passId: z.string().min(1),
  status: z.enum(['paid', 'used']).optional(),
  selectedEvents: z.array(z.string()).optional(),
  teamId: z.string().nullable().optional(),
  regenerateQr: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const rl = await rateLimitAdmin(req, 'mutation');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireAdminRole(req);
    if (result instanceof Response) return result;
    if (!canMutatePasses(result.adminRole)) return forbiddenRole();

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
    const { passId, status, selectedEvents, teamId, regenerateQr, isArchived } = parse.data;

    const db = getAdminFirestore();
    const passRef = db.collection('passes').doc(passId);
    const passSnap = await passRef.get();
    if (!passSnap.exists) {
      return Response.json({ error: 'Pass not found' }, { status: 404 });
    }

    const previousData = passSnap.data() as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (status !== undefined) {
      updates.status = status;
      if (status === 'used') {
        updates.usedAt = new Date();
        updates.scannedBy = result.uid;
      } else {
        updates.usedAt = null;
        updates.scannedBy = null;
      }
    }
    if (selectedEvents !== undefined) updates.selectedEvents = selectedEvents;
    if (teamId !== undefined) updates.teamId = teamId;
    if (regenerateQr === true) {
      const userId = String(previousData.userId ?? '');
      const passType = String(previousData.passType ?? '');
      const qrData = createQRPayload(passId, userId, passType);
      const qrCodeUrl = await QRCode.toDataURL(qrData);
      updates.qrCode = qrCodeUrl;
    }
    if (typeof isArchived === 'boolean') {
      updates.isArchived = isArchived;
      updates.archivedAt = isArchived ? new Date() : null;
      updates.archivedBy = isArchived ? result.uid : null;
    }

    await passRef.update(updates);
    const newSnap = await passRef.get();
    const newData = newSnap.data() as Record<string, unknown>;

    const ipAddress = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined;
    const ip = typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : undefined;
    await logAdminAction(db, {
      adminId: result.uid,
      action: 'update-pass',
      targetCollection: 'passes',
      targetId: passId,
      previousData,
      newData,
      ipAddress: ip,
    });

    return Response.json({
      success: true,
      passId,
      status: newData.status,
      isArchived: newData.isArchived ?? false,
    });
  } catch (error) {
    console.error('Update pass API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
