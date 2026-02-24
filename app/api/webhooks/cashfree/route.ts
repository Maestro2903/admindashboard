import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const rawBody = await req.text();
        const payload = JSON.parse(rawBody);

        console.log('[CashfreeWebhook] Received webhook:', payload);

        // In a real implementation:
        // 1. Verify the signature using the Cashfree Secret Key and the x-webhook-signature header.
        // 2. Identify the orderId (order_id or data.order.order_id).
        // 3. If the status is SUCCESS, trigger the same logic as fix-stuck-payment.

        // For now, we return 200 to acknowledge receipt.
        return new Response('OK', { status: 200 });
    } catch (error) {
        console.error('[CashfreeWebhook] Error handling webhook:', error);
        return new Response('Error', { status: 500 });
    }
}
