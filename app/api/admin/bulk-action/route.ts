import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import {
  requireAdminRole,
  canMutatePasses,
  canMutateTeams,
  canMutateUsersPaymentsEvents,
  forbiddenRole,
} from '@/lib/admin/requireAdminRole';
import { logAdminAction } from '@/lib/admin/adminLogger';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

const bodySchema = z.object({
  action: z.enum([
    'markUsed',
    'revertUsed',
    'forceVerifyPayment',
    'softDelete',
    'delete',
    'activateEvent',
    'deactivateEvent',
  ]),
  targetCollection: z.enum(['passes', 'payments', 'teams', 'users', 'events']),
  targetIds: z.array(z.string().min(1)).max(100),
});

type BulkContext = { uid: string; adminRole: 'viewer' | 'manager' | 'superadmin' };

function canRunPassBulk(ctx: BulkContext): boolean {
  return canMutatePasses(ctx.adminRole);
}

function canRunTeamBulk(ctx: BulkContext): boolean {
  return canMutateTeams(ctx.adminRole);
}

function canRunEventBulk(ctx: BulkContext): boolean {
  return canMutateUsersPaymentsEvents(ctx.adminRole);
}

function canRunPaymentBulk(ctx: BulkContext): boolean {
  return canMutateUsersPaymentsEvents(ctx.adminRole);
}

function canRunSoftDelete(collection: string, ctx: BulkContext): boolean {
  if (collection === 'passes') return canMutatePasses(ctx.adminRole);
  if (collection === 'teams') return canMutateTeams(ctx.adminRole);
  if (collection === 'users' || collection === 'payments' || collection === 'events') {
    return canMutateUsersPaymentsEvents(ctx.adminRole);
  }
  return false;
}

export async function POST(req: NextRequest) {
  const rl = await rateLimitAdmin(req, 'bulk');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireAdminRole(req);
    if (result instanceof Response) return result;
    const ctx = result;

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
    const { action, targetCollection, targetIds } = parse.data;

    const isPassBulkAction =
      targetCollection === 'passes' &&
      (action === 'markUsed' || action === 'revertUsed' || action === 'softDelete' || action === 'delete');
    const isTeamSoftDelete = targetCollection === 'teams' && action === 'softDelete';
    const isPaymentDelete = targetCollection === 'payments' && action === 'delete';

    if (isPassBulkAction && !canRunPassBulk(ctx)) {
      return forbiddenRole();
    }

    if (isTeamSoftDelete && !canRunTeamBulk(ctx)) {
      return forbiddenRole();
    }

    if (isPaymentDelete && !canRunPaymentBulk(ctx)) {
      return forbiddenRole();
    }

    if (action === 'forceVerifyPayment') {
      if (targetCollection !== 'payments' || !canRunPaymentBulk(ctx)) return forbiddenRole();
    } else if (action === 'activateEvent' || action === 'deactivateEvent') {
      if (targetCollection !== 'events' || !canRunEventBulk(ctx)) return forbiddenRole();
    } else if (action === 'softDelete') {
      if (!canRunSoftDelete(targetCollection, ctx)) return forbiddenRole();
    } else if (
      !isPassBulkAction &&
      !isTeamSoftDelete &&
      !isPaymentDelete &&
      action !== 'forceVerifyPayment' &&
      action !== 'activateEvent' &&
      action !== 'deactivateEvent'
    ) {
      return forbiddenRole();
    }

    const db = getAdminFirestore();
    const ipAddress = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined;
    const ip = typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : undefined;
    const errors: Array<{ id: string; error: string }> = [];
    let updated = 0;

    for (const targetId of targetIds) {
      try {
        const ref = db.collection(targetCollection).doc(targetId);
        const snap = await ref.get();
        if (!snap.exists) {
          errors.push({ id: targetId, error: 'Not found' });
          continue;
        }
        const previousData = snap.data() as Record<string, unknown>;
        let updates: Record<string, unknown> = { updatedAt: new Date() };

        if (action === 'markUsed' && targetCollection === 'passes') {
          if (previousData.status === 'used') {
            errors.push({ id: targetId, error: 'Already used' });
            continue;
          }
          updates = { status: 'used', usedAt: new Date(), scannedBy: ctx.uid, updatedAt: new Date() };
        } else if (action === 'revertUsed' && targetCollection === 'passes') {
          if (previousData.status !== 'used' && !previousData.usedAt) {
            errors.push({ id: targetId, error: 'Not used' });
            continue;
          }
          updates = { status: 'paid', usedAt: null, scannedBy: null, updatedAt: new Date() };
        } else if (action === 'forceVerifyPayment' && targetCollection === 'payments') {
          updates = { status: 'success', updatedAt: new Date(), fixedManually: true };
        } else if (action === 'softDelete') {
          updates = {
            ...updates,
            isArchived: true,
            archivedAt: new Date(),
            archivedBy: ctx.uid,
          };
        } else if (action === 'activateEvent' && targetCollection === 'events') {
          updates = { isActive: true, updatedAt: new Date() };
        } else if (action === 'deactivateEvent' && targetCollection === 'events') {
          updates = { isActive: false, updatedAt: new Date() };
        } else if (action === 'delete' && targetCollection === 'passes') {
          await ref.delete();
          await logAdminAction(db, {
            adminId: ctx.uid,
            action: 'bulk-delete',
            targetCollection,
            targetId,
            previousData,
            newData: { deleted: true },
            ipAddress: ip,
          });
          updated += 1;
          continue;
        } else if (action === 'delete' && targetCollection === 'payments') {
          await ref.delete();
          await logAdminAction(db, {
            adminId: ctx.uid,
            action: 'bulk-delete',
            targetCollection,
            targetId,
            previousData,
            newData: { deleted: true },
            ipAddress: ip,
          });
          updated += 1;
          continue;
        } else {
          errors.push({ id: targetId, error: 'Invalid action/collection' });
          continue;
        }

        await ref.update(updates);
        const newSnap = await ref.get();
        const newData = newSnap.data() as Record<string, unknown>;
        await logAdminAction(db, {
          adminId: ctx.uid,
          action: `bulk-${action}`,
          targetCollection,
          targetId,
          previousData,
          newData,
          ipAddress: ip,
        });
        updated += 1;
      } catch (err) {
        errors.push({ id: targetId, error: err instanceof Error ? err.message : 'Update failed' });
      }
    }

    return Response.json({ success: true, updated, errors: errors.length ? errors : undefined });
  } catch (error) {
    console.error('Bulk action API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
