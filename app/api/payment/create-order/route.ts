import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

const bodySchema = z.object({
    registrationId: z.string().min(1),
    notes: z.string().max(1000).optional(),
});

const CASHFREE_BASE =
    process.env.NEXT_PUBLIC_CASHFREE_ENV === 'production'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';

export async function POST(req: NextRequest) {
    const rl = await rateLimitAdmin(req, 'mutation');
    if (rl.limited) return rateLimitResponse(rl);

    try {
        const ctx = await requireOrganizer(req);
        if (ctx instanceof Response) return ctx;

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

        // Price Integrity Check
        const passType = (registrationData.passType as string) ?? '';
        let amount: number;

        // Use the registration's calculated amount as the source of truth
        const amountVal =
            typeof registrationData.calculatedAmount === 'number'
                ? registrationData.calculatedAmount
                : Number(registrationData.amount);

        amount = Number.isFinite(amountVal) ? Number(amountVal) : 0;

        // Sanity checks/Minimums (Relaxed for testing ₹1)
        if (!Number.isFinite(amount) || amount <= 0) {
            return Response.json(
                { error: `Invalid amount (${amount}) for passType: ${passType}` },
                { status: 400 }
            );
        }

        const appId = process.env.NEXT_PUBLIC_CASHFREE_APP_ID || process.env.CASHFREE_APP_ID;
        const secret = process.env.CASHFREE_SECRET_KEY;

        if (!appId || !secret) {
            return Response.json({ error: 'Payment not configured' }, { status: 500 });
        }

        // Create a unique Order ID
        const cashfreeOrderId = `admin_${registrationId}_${Date.now()}`;

        // 1. Create Firestore pending payment record
        const paymentDoc = {
            registrationId,
            userId: registrationData.userId ?? null,
            amount,
            status: 'pending',
            cashfreeOrderId,
            createdAt: new Date(),
            updatedAt: new Date(),
            notes: notes ?? null,
            source: 'admin-dashboard-onspot',
            passType,
        };
        await db.collection('onspotPayments').doc(cashfreeOrderId).set(paymentDoc);

        // 2. Call Cashfree API to create order and get paymentSessionId
        let baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_MAIN_SITE_URL || '').trim();
        baseUrl = baseUrl.replace(/\/$/, '');

        // Fallback for Vercel/dynamic host if baseUrl is empty.
        if (!baseUrl && req.headers.get('host')) {
            const host = req.headers.get('host') || 'localhost:3000';
            const protocol = host.includes('localhost') ? 'http' : 'https';
            baseUrl = `${protocol}://${host}`;
        }

        // Normalize phone: remove non-digits and take last 10
        const rawPhone = (registrationData.phone as string) || '9999999999';
        const cleanPhone = rawPhone.replace(/[^0-9]/g, '').slice(-10) || '9999999999';

        const isProduction = process.env.NEXT_PUBLIC_CASHFREE_ENV === 'production';
        let safeReturnUrl = `${baseUrl}/admin/registrations?order_id={order_id}`;

        // CRITICAL: Cashfree Production enforces HTTPS for both notify_url and return_url
        if (isProduction && safeReturnUrl.startsWith('http://')) {
            safeReturnUrl = safeReturnUrl.replace('http://', 'https://');
        }

        const orderPayload: any = {
            order_amount: amount,
            order_currency: 'INR',
            order_id: cashfreeOrderId,
            customer_details: {
                customer_id: (registrationData.userId as string) || `anon_${registrationId}`,
                customer_name: (registrationData.name as string) || 'Admin User',
                customer_email: (registrationData.email as string) || 'noreply@takshashila.in',
                customer_phone: cleanPhone,
            },
        };

        // Only add order_meta if we have a valid absolute URL.
        const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');

        if (baseUrl.startsWith('http')) {
            orderPayload.order_meta = {
                // If on localhost in production, skip notify_url to avoid Cashfree rejection.
                ...(isProduction && isLocalhost ? {} : { notify_url: `${baseUrl}/api/webhooks/cashfree` }),
                return_url: safeReturnUrl
            };
        }

        console.log('[CreateOrder] Final Payload:', JSON.stringify(orderPayload, null, 2));

        const cfResponse = await fetch(`${CASHFREE_BASE}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-client-id': appId,
                'x-client-secret': secret,
                'x-api-version': '2023-08-01',
            },
            body: JSON.stringify(orderPayload),
        });

        const cfData = await cfResponse.json();
        if (!cfResponse.ok) {
            console.error('[CreateOrder] Cashfree Error Details:', {
                status: cfResponse.status,
                data: cfData,
                env: process.env.NEXT_PUBLIC_CASHFREE_ENV,
                orderId: cashfreeOrderId
            });

            return Response.json(
                {
                    error: `Cashfree Error (${cfData.code || cfResponse.status}): ${cfData.message || 'Check terminal logs'}`,
                    message: cfData.message,
                    code: cfData.code,
                    details: cfData
                },
                { status: 502 }
            );
        }

        return Response.json({
            success: true,
            paymentSessionId: cfData.payment_session_id,
            orderId: cashfreeOrderId,
        });
    } catch (error) {
        console.error('[CreateOrder] Error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Server error' },
            { status: 500 }
        );
    }
}
