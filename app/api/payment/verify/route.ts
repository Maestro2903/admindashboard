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

        console.log(`[VerifyOrder] Verifying payment for orderId: ${orderId}`);

        // Call the existing fix-stuck-payment logic to handle the verification and pass creation
        // This avoids code duplication and ensures the same logic is used for both manual fixes and automatic verification.
        const host = req.headers.get('host') || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        let baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || `${protocol}://${host}`;
        // Enforce HTTPS in production environments to avoid 308 redirects that drop Authorization headers
        if (baseUrl.startsWith('http://') && !baseUrl.includes('localhost')) {
            baseUrl = baseUrl.replace('http://', 'https://');
        }

        console.log(`[VerifyOrder] Using baseUrl: ${baseUrl}`);

        const authHeader = req.headers.get('Authorization') || '';

        let verifyRes: Response;
        let verifyData: unknown;
        
        try {
            verifyRes = await fetch(`${baseUrl}/api/fix-stuck-payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: authHeader,
                },
                body: JSON.stringify({ orderId }),
            });

            // Try to parse JSON, but handle non-JSON responses gracefully
            const text = await verifyRes.text();
            try {
                verifyData = JSON.parse(text);
            } catch {
                verifyData = { error: text || 'Unknown error', status: verifyRes.status };
            }

            if (!verifyRes.ok) {
                return Response.json(
                    { error: (verifyData as { error?: string }).error || 'Verification failed', details: verifyData },
                    { status: verifyRes.status }
                );
            }
        } catch (fetchError) {
            console.error('[VerifyOrder] Fetch error:', fetchError);
            return Response.json(
                { error: 'Failed to verify payment', details: fetchError instanceof Error ? fetchError.message : 'Network error' },
                { status: 500 }
            );
        }

        // After successful verification, update the registration status to 'converted'
        try {
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
                    console.log(`[VerifyOrder] Updated registration ${registrationId} to converted`);
                } else {
                    console.warn(`[VerifyOrder] No registrationId found in onspotPayments for orderId: ${orderId}`);
                }
            } else {
                console.warn(`[VerifyOrder] No onspotPayments document found for orderId: ${orderId}`);
            }
        } catch (dbError) {
            // Log but don't fail the request - payment verification succeeded
            console.error('[VerifyOrder] Error updating registration status:', dbError);
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
