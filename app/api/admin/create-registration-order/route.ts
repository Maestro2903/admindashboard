import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { requireAdminRole, forbiddenRole } from '@/lib/admin/requireAdminRole';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

const PASS_PRICES: Record<string, number> = {
    day_pass: 500,
    proshow: 1500,
    group_events: 500,
    sana_concert: 2000,
};

const bodySchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1), // Relaxed phone length for international/formatted inputs
    college: z.string().min(1),
    passType: z.enum(['day_pass', 'proshow', 'group_events', 'sana_concert']),
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
        if (!['manager', 'superadmin'].includes(result.adminRole)) return forbiddenRole();

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
        const { name, email, phone, college, passType } = parse.data;

        const amount = PASS_PRICES[passType];
        if (amount === undefined) {
            return Response.json({ error: 'Invalid pass type' }, { status: 400 });
        }

        const appId = process.env.NEXT_PUBLIC_CASHFREE_APP_ID || process.env.CASHFREE_APP_ID;
        const secret = process.env.CASHFREE_SECRET_KEY;

        if (!appId || !secret) {
            return Response.json({ error: 'Cashfree credentials not configured' }, { status: 500 });
        }

        const db = getAdminFirestore();

        // Look for existing user or create mock UID for manual registration
        let customerId = `manual_cust_${Date.now()}`;
        const usersQ = await db.collection('users').where('email', '==', email).limit(1).get();
        if (!usersQ.empty) {
            customerId = usersQ.docs[0].id; // use their real user ID
        } else {
            // Optionally create a skeleton user doc if they don't exist
            const newUserRef = db.collection('users').doc();
            customerId = newUserRef.id;
            await newUserRef.set({
                email,
                name,
                phone,
                college,
                isOrganizer: false,
                createdAt: new Date(),
                createdManually: true
            });
        }

        const orderId = `order_${Date.now()}_${customerId.substring(0, 8)}`;

        // Create the payment intent in Firestore
        await db.collection('payments').doc(orderId).set({
            userId: customerId,
            amount,
            passType,
            cashfreeOrderId: orderId,
            createdAt: new Date(),
            updatedAt: new Date(),
            status: 'pending', // Will switch to "success" upon manual confirmation or webhook
            customerDetails: { name, email, phone, college },
            isManualRegistration: true,
            registeredByAdmin: result.uid
        });

        let baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_MAIN_SITE_URL || '').trim();
        baseUrl = baseUrl.replace(/\/$/, '');

        // Fallback for Vercel/dynamic host if baseUrl is empty.
        if (!baseUrl && req.headers.get('host')) {
            const host = req.headers.get('host') || 'localhost:3000';
            const protocol = host.includes('localhost') ? 'http' : 'https';
            baseUrl = `${protocol}://${host}`;
        }

        // CRITICAL: Cashfree Production rejects 'localhost' in notify_url.
        const isProduction = process.env.NEXT_PUBLIC_CASHFREE_ENV === 'production';
        const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');

        let safeReturnUrl = `${baseUrl}/admin/registrations?order_id={order_id}`;

        // CRITICAL: Cashfree Production enforces HTTPS for both notify_url and return_url
        if (isProduction && safeReturnUrl.startsWith('http://')) {
            safeReturnUrl = safeReturnUrl.replace('http://', 'https://');
        }

        const cfPayload: any = {
            order_amount: amount,
            order_currency: "INR",
            order_id: orderId,
            customer_details: {
                customer_id: customerId,
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
            console.error('[ManualCreateOrder] Cashfree status:', response.status, 'Error:', data);
            return Response.json({
                error: `Cashfree Error (${data.code || response.status}): ${data.message || 'Verification failed'}`,
                message: data.message || 'Failed to create manual order',
                code: data.code,
                details: data
            }, { status: 502 });
        }

        return Response.json({
            success: true,
            orderId,
            paymentSessionId: data.payment_session_id
        });
    } catch (error) {
        console.error('Create manual registration order error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Server error' },
            { status: 500 }
        );
    }
}
