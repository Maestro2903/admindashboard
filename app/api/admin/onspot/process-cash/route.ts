import { NextRequest } from 'next/server';
import { z } from 'zod';
import QRCode from 'qrcode';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { requireAdminRole, canMutateUsersPaymentsEvents, forbiddenRole } from '@/lib/admin/requireAdminRole';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';
import { logAdminAction } from '@/lib/admin/adminLogger';
import { createQRPayload } from '@/features/passes/qrService';
import { rebuildAdminDashboardForUser } from '@/lib/admin/buildAdminDashboard';

const GROUP_EVENTS_PRICE_PER_PERSON = 250;

const PASS_PRICES: Record<string, number> = {
    day_pass: 500,
    group_events: GROUP_EVENTS_PRICE_PER_PERSON,
    sana_concert: 2000,
    test_pass: 1,
};

const memberSchema = z.object({
    name: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().optional(),
    isLeader: z.boolean().optional(),
});

const bodySchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1),
    college: z.string().min(1),
    passType: z.enum(['day_pass', 'group_events', 'sana_concert', 'test_pass']),
    selectedEvents: z.array(z.string()).optional(),
    teamName: z.string().min(1).optional(),
    members: z.array(memberSchema).optional(),
    amount: z.number().positive().optional(),
    pricePerPerson: z.number().positive().optional(),
});

export async function POST(req: NextRequest) {
    const rl = await rateLimitAdmin(req, 'mutation');
    if (rl.limited) return rateLimitResponse(rl);

    try {
        const ctx = await requireAdminRole(req);
        if (ctx instanceof Response) return ctx;
        if (!['manager', 'editor', 'superadmin'].includes(ctx.adminRole)) return forbiddenRole();

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
        const { name, email, phone, college, passType, selectedEvents, teamName, members: rawMembers, amount: bodyAmount, pricePerPerson: bodyPricePerPerson } = parse.data;

        let amount: number;
        if (passType === 'group_events') {
            const totalMembers = Math.max(1, rawMembers?.length ?? 1);
            const pricePerPerson = bodyPricePerPerson ?? GROUP_EVENTS_PRICE_PER_PERSON;
            amount = bodyAmount ?? totalMembers * pricePerPerson;
            if (!teamName?.trim() || !rawMembers?.length) {
                return Response.json(
                    { error: 'Group events require team name and at least one member' },
                    { status: 400 }
                );
            }
        } else {
            amount = PASS_PRICES[passType] ?? 0;
        }
        if (amount === undefined || amount <= 0) {
            return Response.json({ error: 'Invalid pass type or amount' }, { status: 400 });
        }

        const db = getAdminFirestore();

        // 1. User Lookup / Creation
        let userId = `onspot_user_${Date.now()}`;
        const usersQ = await db.collection('users').where('email', '==', email).limit(1).get();
        if (!usersQ.empty) {
            userId = usersQ.docs[0].id;
        } else {
            const newUserRef = db.collection('users').doc();
            userId = newUserRef.id;
            await newUserRef.set({
                email,
                name,
                phone,
                college,
                isOrganizer: false,
                createdAt: new Date(),
                createdOnSpot: true,
                addedBy: ctx.uid
            });
        }

        const orderId = `onspot_${Date.now()}_${userId.substring(0, 6)}`;
        const eventIds = selectedEvents || [];

        let teamId: string | undefined;
        let teamSnapshot: { teamName: string; totalMembers: number; members: Array<{ memberId: string; name: string; phone: string; email?: string; isLeader: boolean }> } | undefined;

        if (passType === 'group_events' && rawMembers?.length && teamName?.trim()) {
            const teamRef = db.collection('teams').doc();
            teamId = teamRef.id;
            const members = rawMembers.map((m, i) => ({
                memberId: `member_${Date.now()}_${i}`,
                name: m.name.trim(),
                phone: m.phone.trim(),
                email: (m.email ?? '').trim() || undefined,
                isLeader: i === 0,
                attendance: { checkedIn: false, checkedInAt: null, checkedInBy: null },
            }));
            teamSnapshot = { teamName: teamName.trim(), totalMembers: members.length, members };
            await teamRef.set({
                leaderId: userId,
                teamName: teamName.trim(),
                members,
                totalMembers: members.length,
                paymentStatus: 'success',
                createdAt: new Date(),
                updatedAt: new Date(),
                eventIds,
            });
        }

        // 2. Create the Registration record in "registrations"
        const registrationRef = db.collection('registrations').doc(orderId);
        const registrationData: Record<string, unknown> = {
            userId,
            name,
            email,
            phone,
            college,
            passType,
            selectedEvents: eventIds,
            amount,
            status: 'converted',
            cashfreeOrderId: 'CASH',
            addedBy: ctx.uid,
            createdAt: new Date(),
            updatedAt: new Date(),
            source: 'admin-onspot-cash',
        };
        if (teamId) registrationData.teamId = teamId;
        await registrationRef.set(registrationData);

        // 3. Create Payment Record (Success)
        const paymentId = `CASH_${orderId}_${Date.now()}`;
        const paymentData: Record<string, unknown> = {
            registrationId: orderId,
            userId,
            amount,
            status: 'success',
            cashfreeOrderId: 'CASH',
            paymentId,
            createdAt: new Date(),
            updatedAt: new Date(),
            notes: 'Cash payment processed via On-Spot Admin Dashboard',
            source: 'admin-onspot-cash',
            passType,
            eventIds,
        };
        if (teamId) paymentData.teamId = teamId;
        await db.collection('payments').doc(paymentId).set(paymentData);

        // 4. Generate Pass and Store in 'passes' collection
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
            notes: 'Cash payment from On-Spot',
        };
        if (teamId && teamSnapshot) {
            passData.teamId = teamId;
            passData.teamSnapshot = teamSnapshot;
        }
        await passRef.set(passData);

        if (teamId) {
            await db.collection('teams').doc(teamId).update({
                passId: passRef.id,
                paymentStatus: 'success',
                updatedAt: new Date(),
            });
        }

        // 5. Update Registration with the generated Pass and Payment
        await registrationRef.update({
            paymentId,
            passId: passRef.id,
        });

        // 6. Log Admin Action
        const ipHeader = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined;
        const ip = typeof ipHeader === 'string' ? ipHeader.split(',')[0].trim() : undefined;

        await logAdminAction(db, {
            adminId: ctx.uid,
            action: 'onspot-process-cash',
            targetCollection: 'registrations',
            targetId: orderId,
            previousData: {},
            newData: {
                ...registrationData,
                paymentId,
                passId: passRef.id,
            },
            ipAddress: ip,
        });

        // 7. Rebuild Dashboard for the user
        void rebuildAdminDashboardForUser(userId).catch((err) =>
            console.error('[OnSpotCashPayment] rebuildAdminDashboard error:', err)
        );

        return Response.json({
            success: true,
            message: 'Cash payment processed, registration created, and pass generated.',
            orderId,
            passId: passRef.id,
            paymentId,
        });

    } catch (error) {
        console.error('On-spot cash payment error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Server error' },
            { status: 500 }
        );
    }
}
