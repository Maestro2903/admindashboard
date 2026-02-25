import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import * as admin from 'firebase-admin';

export async function POST(req: NextRequest) {
    try {
        const rawBody = await req.text();
        const payload = JSON.parse(rawBody);

        console.log('[CashfreeWebhook] Received webhook:', {
            type: payload.type,
            orderId: payload.data?.order?.order_id,
            orderStatus: payload.data?.order?.order_status,
        });

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

        console.log('[CashfreeWebhook] Signature verification:', {
            timestamp,
            signatureProvided: signature.substring(0, 20) + '...',
            signatureComputed: computedSignature.substring(0, 20) + '...',
        });

        if (computedSignature !== signature) {
            console.error('[CashfreeWebhook] Signature verification failed');
            return new Response('Invalid Signature', { status: 401 });
        }

        console.log('[CashfreeWebhook] Signature verified successfully');

        // 2. Detect successful payment using correct Cashfree webhook structure
        const eventType = payload.type;
        const orderStatus = payload.data?.order?.order_status;
        const orderId = payload.data?.order?.order_id;

        console.log('[CashfreeWebhook] Payment detection:', {
            eventType,
            orderStatus,
            orderId,
        });

        // Only process PAYMENT_SUCCESS_WEBHOOK events with PAID status
        if (eventType !== 'PAYMENT_SUCCESS_WEBHOOK' || orderStatus !== 'PAID' || !orderId) {
            console.log('[CashfreeWebhook] Webhook not a successful payment event, acknowledging');
            return new Response('OK', { status: 200 });
        }

        console.log(`[CashfreeWebhook] Payment SUCCESS for order ${orderId}, processing...`);

        // 3. Find registration by orderId
        const db = getAdminFirestore();
        let registrationId: string | null = null;

        // Strategy 1: Check onspotPayments collection (document ID = orderId)
        try {
            const onspotPaymentSnap = await db.collection('onspotPayments').doc(orderId).get();
            if (onspotPaymentSnap.exists) {
                const onspotData = onspotPaymentSnap.data();
                registrationId = onspotData?.registrationId as string | undefined || null;
                console.log(`[CashfreeWebhook] Found registrationId from onspotPayments: ${registrationId}`);
            }
        } catch (error) {
            console.warn('[CashfreeWebhook] Error checking onspotPayments:', error);
        }

        // Strategy 2: Check payments collection (cashfreeOrderId field)
        if (!registrationId) {
            try {
                const paymentsSnapshot = await db
                    .collection('payments')
                    .where('cashfreeOrderId', '==', orderId)
                    .limit(1)
                    .get();

                if (!paymentsSnapshot.empty) {
                    const paymentData = paymentsSnapshot.docs[0].data();
                    registrationId = paymentData?.registrationId as string | undefined || null;
                    console.log(`[CashfreeWebhook] Found registrationId from payments: ${registrationId}`);
                }
            } catch (error) {
                console.warn('[CashfreeWebhook] Error checking payments:', error);
            }
        }

        // Strategy 3: Extract from orderId format (admin_${registrationId}_${timestamp})
        if (!registrationId && orderId.startsWith('admin_')) {
            const parts = orderId.split('_');
            if (parts.length >= 2) {
                // Extract registrationId from format: admin_${registrationId}_${timestamp}
                registrationId = parts[1];
                console.log(`[CashfreeWebhook] Extracted registrationId from orderId format: ${registrationId}`);
            }
        }

        // Strategy 4: Try direct lookup (fallback)
        if (!registrationId) {
            try {
                const regSnap = await db.collection('registrations').doc(orderId).get();
                if (regSnap.exists) {
                    registrationId = orderId;
                    console.log(`[CashfreeWebhook] Using orderId as registrationId (direct lookup): ${registrationId}`);
                }
            } catch (error) {
                console.warn('[CashfreeWebhook] Error checking direct registration lookup:', error);
            }
        }

        if (!registrationId) {
            console.error(`[CashfreeWebhook] Registration not found for orderId: ${orderId}`);
            return new Response('Registration not found', { status: 404 });
        }

        // 4. Idempotency check - verify registration exists and check current status
        const registrationRef = db.collection('registrations').doc(registrationId);
        const registrationSnap = await registrationRef.get();

        if (!registrationSnap.exists) {
            console.error(`[CashfreeWebhook] Registration document not found: ${registrationId}`);
            return new Response('Registration not found', { status: 404 });
        }

        const currentStatus = registrationSnap.data()?.status;
        console.log(`[CashfreeWebhook] Current registration status: ${currentStatus}`);

        if (currentStatus === 'converted') {
            console.log(`[CashfreeWebhook] Registration already converted: ${registrationId}, skipping update`);
            return new Response('Already processed', { status: 200 });
        }

        // 5. Update registration status to converted
        await registrationRef.update({
            status: 'converted',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[CashfreeWebhook] Registration ${registrationId} marked as converted`);

        // Acknowledge receipt.
        return new Response('OK', { status: 200 });
    } catch (error) {
        console.error('[CashfreeWebhook] Error handling webhook:', error);
        return new Response('Error', { status: 500 });
    }
}
