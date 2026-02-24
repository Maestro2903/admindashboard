import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

const bodySchema = z.object({
    orderId: z.string().min(1),
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

        const { orderId } = parsed.data;

        // Call the existing fix-stuck-payment logic to handle the verification and pass creation
        // This avoids code duplication and ensures the same logic is used for both manual fixes and automatic verification.
        const host = req.headers.get('host') || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        let baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || `${protocol}://${host}`;
        // Enforce HTTPS in production environments to avoid 308 redirects that drop Authorization headers
        if (baseUrl.startsWith('http://') && !baseUrl.includes('localhost')) {
            baseUrl = baseUrl.replace('http://', 'https://');
        }

        const authHeader = req.headers.get('Authorization') || '';

        const verifyRes = await fetch(`${baseUrl}/api/fix-stuck-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: authHeader,
            },
            body: JSON.stringify({ orderId }),
        });

        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) {
            return Response.json(verifyData, { status: verifyRes.status });
        }

        // After successful verification, update the registration status to 'converted'
        const db = getAdminFirestore();
        const paymentSnap = await db.collection('onspotPayments').doc(orderId).get();
        if (paymentSnap.exists) {
            const { registrationId } = paymentSnap.data() as { registrationId?: string };
            if (registrationId) {
                await db.collection('registrations').doc(registrationId).update({
                    status: 'converted',
                    updatedAt: new Date(),
                    statusUpdatedAt: new Date(),
                    statusUpdatedBy: ctx.uid,
                });
            }
        }

        return Response.json({
            success: true,
            message: 'Payment verified, pass created, and registration marked as converted',
            details: verifyData,
        });
    } catch (error) {
        console.error('[VerifyOrder] Error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Server error' },
            { status: 500 }
        );
    }
}
