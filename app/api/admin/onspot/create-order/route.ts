import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { requireAdminRole, forbiddenRole } from '@/lib/admin/requireAdminRole';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

const GROUP_EVENTS_PRICE_PER_PERSON = 250;

const PASS_PRICES: Record<string, number> = {
    day_pass: 500,
    group_events: GROUP_EVENTS_PRICE_PER_PERSON, // base; actual = totalMembers * 250
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

const CASHFREE_BASE = process.env.NEXT_PUBLIC_CASHFREE_ENV === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

export async function POST(req: NextRequest) {
    const rl = await rateLimitAdmin(req, 'mutation');
    if (rl.limited) return rateLimitResponse(rl);

    try {
        const result = await requireAdminRole(req);
        if (result instanceof Response) return result;
        if (!['manager', 'editor', 'superadmin'].includes(result.adminRole)) return forbiddenRole();

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
            if (amount <= 0 || amount !== totalMembers * pricePerPerson) {
                return Response.json(
                    { error: `Group events amount must be ${totalMembers} × ₹${pricePerPerson} = ₹${totalMembers * pricePerPerson}` },
                    { status: 400 }
                );
            }
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

        const appId = process.env.NEXT_PUBLIC_CASHFREE_APP_ID || process.env.CASHFREE_APP_ID;
        const secret = process.env.CASHFREE_SECRET_KEY;

        if (!appId || !secret) {
            return Response.json({ error: 'Cashfree credentials not configured' }, { status: 500 });
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
                addedBy: result.uid
            });
        }

        const orderId = `onspot_${Date.now()}_${userId.substring(0, 6)}`;
        const eventIds = selectedEvents || [];

        let teamId: string | undefined;
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
            await teamRef.set({
                leaderId: userId,
                teamName: teamName.trim(),
                members,
                totalMembers: members.length,
                paymentStatus: 'pending',
                createdAt: new Date(),
                updatedAt: new Date(),
                eventIds,
            });
        }

        // 2. Create the Registration record
        const registrationRef = db.collection('registrations').doc(orderId);
        await registrationRef.set({
            userId,
            name,
            email,
            phone,
            college,
            passType,
            selectedEvents: eventIds,
            amount,
            status: 'pending',
            cashfreeOrderId: orderId,
            addedBy: result.uid,
            createdAt: new Date(),
            updatedAt: new Date(),
            source: 'admin-onspot',
            ...(teamId && { teamId }),
        });

        // 3. Create Firestore pending payment record (critical for fix-stuck-payment webhook functionality)
        const paymentDoc: Record<string, unknown> = {
            registrationId: orderId,
            userId,
            amount,
            status: 'pending',
            cashfreeOrderId: orderId,
            createdAt: new Date(),
            updatedAt: new Date(),
            source: 'admin-onspot',
            passType,
            eventIds,
        };
        if (teamId) paymentDoc.teamId = teamId;
        await db.collection('onspotPayments').doc(orderId).set(paymentDoc);

        // 3. Prepare Cashfree Payload
        let baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_MAIN_SITE_URL || '').trim();
        baseUrl = baseUrl.replace(/\/$/, '');

        if (!baseUrl && req.headers.get('host')) {
            const host = req.headers.get('host') || 'localhost:3000';
            const protocol = host.includes('localhost') ? 'http' : 'https';
            baseUrl = `${protocol}://${host}`;
        }

        const isProduction = process.env.NEXT_PUBLIC_CASHFREE_ENV === 'production';
        const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');

        // Redirect back to the on-spot page
        let safeReturnUrl = `${baseUrl}/admin/on-spot?order_id={order_id}`;
        if (isProduction && safeReturnUrl.startsWith('http://')) {
            safeReturnUrl = safeReturnUrl.replace('http://', 'https://');
        }

        const cfPayload: any = {
            order_amount: amount,
            order_currency: "INR",
            order_id: orderId,
            customer_details: {
                customer_id: userId,
                customer_name: name,
                customer_email: email,
                customer_phone: phone.replace(/[^0-9]/g, '').slice(-10)
            },
            order_meta: {
                ...(isProduction && isLocalhost ? {} : { notify_url: `${baseUrl}/api/webhooks/cashfree` }),
                return_url: safeReturnUrl
            }
        };

        const response = await fetch(`${CASHFREE_BASE}/orders`, {
            method: 'POST',
            headers: {
                'x-client-id': appId,
                'x-client-secret': secret,
                'x-api-version': '2023-08-01',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(cfPayload)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[OnSpotCreateOrder] Cashfree Error:', data);
            return Response.json({
                error: `Cashfree Error: ${data.message || 'Failed to create order'}`,
                details: data
            }, { status: 502 });
        }

        return Response.json({
            success: true,
            orderId,
            paymentSessionId: data.payment_session_id
        });

    } catch (error) {
        console.error('On-spot create order error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Server error' },
            { status: 500 }
        );
    }
}
