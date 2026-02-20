import { NextRequest } from 'next/server';
import { requireAdminRole, canMutatePasses, forbiddenRole } from '@/lib/admin/requireAdminRole';
import { logAdminAction } from '@/lib/admin/adminLogger';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ passId: string }> }
) {
  const rl = await rateLimitAdmin(req, 'mutation');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireAdminRole(req);
    if (result instanceof Response) return result;
    if (!canMutatePasses(result.adminRole)) return forbiddenRole();

    const { passId } = await params;
    if (!passId) {
      return Response.json({ error: 'Missing passId' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const passRef = db.collection('passes').doc(passId);
    const passSnap = await passRef.get();

    if (!passSnap.exists) {
      return Response.json({ error: 'Pass not found' }, { status: 404 });
    }

    const previousData = passSnap.data() as Record<string, unknown>;
    const ipAddress = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined;
    const ip = typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : undefined;

    await passRef.delete();
    await logAdminAction(db, {
      adminId: result.uid,
      action: 'delete',
      targetCollection: 'passes',
      targetId: passId,
      previousData,
      newData: { deleted: true },
      ipAddress: ip,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Pass delete API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ passId: string }> }
) {
  const rl = await rateLimitAdmin(req, 'mutation');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireAdminRole(req);
    if (result instanceof Response) return result;
    if (!canMutatePasses(result.adminRole)) return forbiddenRole();
    const { uid: organizerUid } = result;

    const { passId } = await params;
    if (!passId) {
      return Response.json({ error: 'Missing passId' }, { status: 400 });
    }

    let body: { action?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const action = body?.action;
    if (action !== 'markUsed' && action !== 'revertUsed') {
      return Response.json(
        { error: 'Invalid action. Use markUsed or revertUsed' },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const passRef = db.collection('passes').doc(passId);
    const passSnap = await passRef.get();

    if (!passSnap.exists) {
      return Response.json({ error: 'Pass not found' }, { status: 404 });
    }

    const passData = passSnap.data() as Record<string, unknown>;
    const currentStatus = passData.status;
    const hasUsedAt = Boolean(passData.usedAt);

    const ipAddress = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined;
    const ip = typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : undefined;

    if (action === 'markUsed') {
      if (currentStatus === 'used' || hasUsedAt) {
        return Response.json({ error: 'Pass is already marked as used' }, { status: 400 });
      }
      const updates = { status: 'used', usedAt: new Date(), scannedBy: organizerUid, updatedAt: new Date() };
      await passRef.update(updates);
      const newSnap = await passRef.get();
      const newData = newSnap.data() as Record<string, unknown>;
      await logAdminAction(db, {
        adminId: organizerUid,
        action: 'markUsed',
        targetCollection: 'passes',
        targetId: passId,
        previousData: passData,
        newData: newData ?? {},
        ipAddress: ip,
      });
      return Response.json({ success: true, status: 'used' });
    }

    if (action === 'revertUsed') {
      if (currentStatus !== 'used' && !hasUsedAt) {
        return Response.json({ error: 'Pass is not marked as used' }, { status: 400 });
      }
      const updates = { status: 'paid', usedAt: null, scannedBy: null, updatedAt: new Date() };
      await passRef.update(updates);
      const newSnap = await passRef.get();
      const newData = newSnap.data() as Record<string, unknown>;
      await logAdminAction(db, {
        adminId: organizerUid,
        action: 'revertUsed',
        targetCollection: 'passes',
        targetId: passId,
        previousData: passData,
        newData: newData ?? {},
        ipAddress: ip,
      });
      return Response.json({ success: true, status: 'paid' });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Pass update API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
