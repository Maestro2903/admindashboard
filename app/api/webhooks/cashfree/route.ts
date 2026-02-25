import { NextRequest } from 'next/server';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
    try {
        const rawBody = await req.text();
        const payload = JSON.parse(rawBody);

        console.log('[CashfreeWebhook] Received webhook:', payload);

        // 1. Verify the signature using the Cashfree Secret Key and the x-webhook-signature header.
        const timestamp = req.headers.get('x-webhook-timestamp');
        const signature = req.headers.get('x-webhook-signature');
        const secretKey = process.env.CASHFREE_WEBHOOK_SECRET_KEY || process.env.CASHFREE_SECRET_KEY;

        if (!timestamp || !signature || !secretKey) {
            console.error('[CashfreeWebhook] Missing signature headers or secret key');
            return new Response('Unauthorized', { status: 401 });
        }

        const signatureString = timestamp + rawBody;
        const computedSignature = crypto
            .createHmac('sha256', secretKey)
            .update(signatureString)
            .digest('base64');

        if (computedSignature !== signature) {
            console.error('[CashfreeWebhook] Signature verification failed');
            return new Response('Invalid Signature', { status: 401 });
        }

        // 2. Identify the orderId (order_id or data.order.order_id).
        const orderId = payload.data?.order?.order_id;
        const paymentStatus = payload.data?.payment?.payment_status;

        // 3. If the status is SUCCESS, trigger the same logic as fix-stuck-payment.
        if (paymentStatus === 'SUCCESS' && orderId) {
            console.log(`[CashfreeWebhook] Payment SUCCESS for order ${orderId}, processing...`);

            const host = req.headers.get('host') || 'localhost:3000';
            const protocol = host.includes('localhost') ? 'http' : 'https';
            let baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || `${protocol}://${host}`;
            if (baseUrl.startsWith('http://') && !baseUrl.includes('localhost')) {
                baseUrl = baseUrl.replace('http://', 'https://');
            }

            // Provide a master or system token if necessary, or bypass if the webhook script supports system calls
            // For now, making a system-level call to the internal server
            const verifyRes = await fetch(`${baseUrl}/api/fix-stuck-payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Note: If fix-stuck-payment strictly requires an organizer token, 
                    // you may need to refactor it or provide a system token here.
                    'x-system-webhook': 'true'
                },
                body: JSON.stringify({ orderId }),
            });

            const verifyData = await verifyRes.text();
            console.log(`[CashfreeWebhook] Fix API Response for ${orderId}: ${verifyRes.status} | ${verifyData}`);
        }

        // Acknowledge receipt.
        return new Response('OK', { status: 200 });
    } catch (error) {
        console.error('[CashfreeWebhook] Error handling webhook:', error);
        return new Response('Error', { status: 500 });
    }
}
