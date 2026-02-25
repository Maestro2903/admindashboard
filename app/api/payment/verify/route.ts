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
        const isLocalhost = host.includes('localhost') || host.startsWith('127.0.0.1');
        const protocol = isLocalhost ? 'http' : 'https';

        let baseUrl: string;

        if (isLocalhost) {
            // In local/dev, always trust the actual host header (correct port),
            // and ignore APP_URL / NEXT_PUBLIC_BASE_URL which are often set to production.
            baseUrl = `${protocol}://${host}`;
        } else {
            // In non-local environments, prefer explicit env, then VERCEL_URL, then host.
            baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_BASE_URL || '';
            if (!baseUrl && process.env.VERCEL_URL) {
                baseUrl = `https://${process.env.VERCEL_URL}`;
            }
            if (!baseUrl) {
                baseUrl = `${protocol}://${host}`;
            }
        }

        // Remove trailing slash if present
        baseUrl = baseUrl.replace(/\/$/, '');

        // Enforce HTTPS in production-like environments to avoid 308 redirects that drop Authorization headers
        if (!isLocalhost && baseUrl.startsWith('http://')) {
            baseUrl = baseUrl.replace('http://', 'https://');
        }

        console.log(
            `[VerifyOrder] Using baseUrl: ${baseUrl} (envSource=${
                isLocalhost
                    ? 'localhost-host-header'
                    : process.env.APP_URL
                        ? 'APP_URL'
                        : process.env.NEXT_PUBLIC_BASE_URL
                            ? 'NEXT_PUBLIC_BASE_URL'
                            : process.env.VERCEL_URL
                                ? 'VERCEL_URL'
                                : 'host header'
            })`
        );

        const authHeader = req.headers.get('Authorization') || '';

        let verifyRes: Response;
        let verifyData: unknown;
        
        try {
            const fixPaymentUrl = `${baseUrl}/api/fix-stuck-payment`;
            console.log(`[VerifyOrder] Calling fix-stuck-payment at: ${fixPaymentUrl}`);
            
            verifyRes = await fetch(fixPaymentUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: authHeader,
                },
                body: JSON.stringify({ orderId }),
            });

            console.log(`[VerifyOrder] fix-stuck-payment response status: ${verifyRes.status}`);

            // Try to parse JSON, but handle non-JSON responses gracefully
            const text = await verifyRes.text();
            try {
                verifyData = JSON.parse(text);
            } catch {
                verifyData = { error: text || 'Unknown error', status: verifyRes.status };
            }

            if (!verifyRes.ok) {
                console.error(`[VerifyOrder] fix-stuck-payment failed with status ${verifyRes.status}:`, verifyData);
                return Response.json(
                    { 
                        error: (verifyData as { error?: string }).error || 'Verification failed', 
                        details: verifyData,
                        statusCode: verifyRes.status,
                    },
                    { status: verifyRes.status >= 400 && verifyRes.status < 600 ? verifyRes.status : 500 }
                );
            }
        } catch (fetchError) {
            console.error('[VerifyOrder] Fetch error:', fetchError);
            const errorMessage = fetchError instanceof Error ? fetchError.message : 'Network error';
            const errorStack = fetchError instanceof Error ? fetchError.stack : undefined;
            console.error('[VerifyOrder] Fetch error details:', { errorMessage, errorStack, baseUrl, orderId });
            return Response.json(
                { 
                    error: 'Failed to verify payment', 
                    details: errorMessage,
                    stack: errorStack,
                    baseUrl,
                },
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
