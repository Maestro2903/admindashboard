import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import QRCode from 'qrcode';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import {
    requireAdminRole,
    canMutateUsersPaymentsEvents,
    forbiddenRole,
} from '@/lib/admin/requireAdminRole';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';
import { logAdminAction } from '@/lib/admin/adminLogger';
import { createQRPayload } from '@/features/passes/qrService';
import { rebuildAdminDashboardForUser } from '@/lib/admin/buildAdminDashboard';

const bodySchema = z.object({
    registrationId: z.string().min(1),
    notes: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
    const rl = await rateLimitAdmin(req, 'mutation');
    if (rl.limited) return rateLimitResponse(rl);

    try {
        const ctx = await requireAdminRole(req);
        if (ctx instanceof Response) return ctx;
        if (!canMutateUsersPaymentsEvents(ctx.adminRole)) return forbiddenRole();

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

        const { registrationId, notes } = parsed.data;
        const db = getAdminFirestore();

        const regRef = db.collection('registrations').doc(registrationId);
        const regSnap = await regRef.get();
        if (!regSnap.exists) {
            return Response.json({ error: 'Registration not found' }, { status: 404 });
        }

        const registrationData = regSnap.data() as Record<string, unknown>;
        const currentStatus = registrationData.status as string;

        if (currentStatus !== 'pending') {
            return Response.json(
                { error: `Registration is already ${currentStatus}` },
                { status: 400 }
            );
        }

        const userId = registrationData.userId as string;
        if (!userId) {
            return Response.json(
                { error: 'Registration does not have a linked userId' },
                { status: 400 }
            );
        }

        const amount =
            typeof registrationData.calculatedAmount === 'number'
                ? registrationData.calculatedAmount
                : Number(registrationData.amount);

        const passType = (registrationData.passType as string) ?? '';
        const eventIds = Array.isArray(registrationData.selectedEvents) ? registrationData.selectedEvents : [];

        // 1. Create Payment Record (Success)
        const paymentId = `CASH_${registrationId}_${Date.now()}`;
        const paymentData = {
            registrationId,
            userId,
            amount,
            status: 'success',
            cashfreeOrderId: 'CASH',
            paymentId,
            createdAt: new Date(),
            updatedAt: new Date(),
            notes: notes ?? 'Cash payment processed via Admin Dashboard',
            source: 'admin-dashboard-cash',
            passType,
            eventIds,
        };
        await db.collection('payments').doc(paymentId).set(paymentData);

        // 2. Generate Pass and Store in 'passes' collection
        const passRef = db.collection('passes').doc();
        const qrData = createQRPayload(passRef.id, userId, passType);
        const qrCodeUrl = await QRCode.toDataURL(qrData);

        const passData: Record<string, unknown> = {
            userId,
            passType,
            amount,
            paymentId: paymentId,
            status: 'paid',
            qrCode: qrCodeUrl,
            createdAt: new Date(),
            createdManually: true,
            eventIds,
            selectedEvents: eventIds,
            notes: notes ?? 'Cash payment',
        };

        // If it's a team event, we might need teamId (optional check)
        if (registrationData.teamId) {
            passData.teamId = registrationData.teamId;
        }

        await passRef.set(passData);

        // 3. Update Registration Status
        await regRef.update({
            status: 'converted',
            statusUpdatedAt: new Date(),
            statusUpdatedBy: ctx.uid,
            updatedAt: new Date(),
            paymentId: paymentId,
            passId: passRef.id,
        });

        // 4. Log Admin Action
        const ipHeader = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined;
        const ip = typeof ipHeader === 'string' ? ipHeader.split(',')[0].trim() : undefined;

        await logAdminAction(db, {
            adminId: ctx.uid,
            action: 'process-cash-payment',
            targetCollection: 'registrations',
            targetId: registrationId,
            previousData: registrationData,
            newData: {
                ...registrationData,
                status: 'converted',
                paymentId,
                passId: passRef.id,
            },
            ipAddress: ip,
        });

        // 5. Rebuild Dashboard for the user
        void rebuildAdminDashboardForUser(userId).catch((err) =>
            console.error('[ProcessCashPayment] rebuildAdminDashboard error:', err)
        );

        return Response.json({
            success: true,
            message: 'Cash payment processed, registration converted, and pass generated.',
            passId: passRef.id,
            paymentId: paymentId,
        });

    } catch (error) {
        console.error('Process cash payment API error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Server error' },
            { status: 500 }
        );
    }
}
