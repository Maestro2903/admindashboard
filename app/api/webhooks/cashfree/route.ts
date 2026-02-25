import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import * as admin from 'firebase-admin';

// Process webhook asynchronously after acknowledging receipt
async function processWebhookAsync(orderId: string) {
    try {
        const db = getAdminFirestore();

        // 3. Idempotency Protection - Check if payment already processed
        // Check both collections in parallel for faster response
        const [existingPaymentsSnapshot, existingOnspotPaymentSnap] = await Promise.all([
            db.collection('payments').where('cashfreeOrderId', '==', orderId).limit(1).get().catch(() => ({ empty: true, docs: [] } as any)),
            db.collection('onspotPayments').doc(orderId).get().catch(() => null)
        ]);

        if (!existingPaymentsSnapshot.empty) {
            const paymentData = existingPaymentsSnapshot.docs[0].data();
            if (paymentData?.status === 'success') {
                console.log(`[CashfreeWebhook] Payment already processed for orderId: ${orderId}`);
                return;
            }
        }

        if (existingOnspotPaymentSnap?.exists) {
            const onspotData = existingOnspotPaymentSnap.data();
            if (onspotData?.status === 'success') {
                console.log(`[CashfreeWebhook] Onspot payment already processed for orderId: ${orderId}`);
                return;
            }
        }

        // 4. Find registration by orderId - try multiple strategies in parallel
        let registrationId: string | null = null;

        // Strategy 1: Extract from orderId format (fastest, no DB call)
        if (orderId.startsWith('admin_')) {
            const parts = orderId.split('_');
            if (parts.length >= 2) {
                registrationId = parts[1];
                console.log(`[CashfreeWebhook] Extracted registrationId from orderId format: ${registrationId}`);
            }
        }

        // Strategy 2 & 3: Check both collections in parallel if not found yet
        if (!registrationId) {
            const [onspotPaymentSnap, paymentsSnapshot] = await Promise.all([
                db.collection('onspotPayments').doc(orderId).get().catch(() => null),
                db.collection('payments').where('cashfreeOrderId', '==', orderId).limit(1).get().catch(() => ({ empty: true, docs: [] } as any))
            ]);

            if (onspotPaymentSnap?.exists) {
                const onspotData = onspotPaymentSnap.data();
                registrationId = onspotData?.registrationId as string | undefined || null;
                if (registrationId) {
                    console.log(`[CashfreeWebhook] Found registrationId from onspotPayments: ${registrationId}`);
                }
            }

            if (!registrationId && !paymentsSnapshot.empty) {
                const paymentData = paymentsSnapshot.docs[0].data();
                registrationId = paymentData?.registrationId as string | undefined || null;
                if (registrationId) {
                    console.log(`[CashfreeWebhook] Found registrationId from payments: ${registrationId}`);
                }
            }
        }

        // Strategy 4: Try direct lookup (fallback)
        if (!registrationId) {
            const regSnap = await db.collection('registrations').doc(orderId).get().catch(() => null);
            if (regSnap?.exists) {
                registrationId = orderId;
                console.log(`[CashfreeWebhook] Using orderId as registrationId (direct lookup): ${registrationId}`);
            }
        }

        if (!registrationId) {
            console.error(`[CashfreeWebhook] Registration not found for orderId: ${orderId}`);
            return;
        }

        // 5. Idempotency check - verify registration exists and check current status
        const registrationRef = db.collection('registrations').doc(registrationId);
        const registrationSnap = await registrationRef.get();

        if (!registrationSnap.exists) {
            console.error(`[CashfreeWebhook] Registration document not found: ${registrationId}`);
            return;
        }

        const currentStatus = registrationSnap.data()?.status;
        console.log(`[CashfreeWebhook] Current registration status: ${currentStatus}`);

        if (currentStatus === 'converted') {
            console.log(`[CashfreeWebhook] Registration already converted: ${registrationId}, skipping update`);
            return;
        }

        // 6. Update registration status to converted
        await registrationRef.update({
            status: 'converted',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[CashfreeWebhook] Registration ${registrationId} marked as converted`);
    } catch (error) {
        console.error('[CashfreeWebhook] Error processing webhook async:', error);
    }
}

export async function POST(req: NextRequest) {
    try {
        const rawBody = await req.text();
        const payload = JSON.parse(rawBody);

        console.log('[CashfreeWebhook] Received webhook:', {
            type: payload.type,
            orderId: payload.data?.order?.order_id,
            orderStatus: payload.data?.order?.order_status,
            fullPayload: JSON.stringify(payload).substring(0, 500)
        });

        // 1. Verify the signature using the Cashfree Secret Key and the x-webhook-signature header.
        const timestamp = req.headers.get('x-webhook-timestamp');
        const signature = req.headers.get('x-webhook-signature');
        const secretKey = process.env.CASHFREE_WEBHOOK_SECRET_KEY || process.env.CASHFREE_SECRET_KEY;

        if (timestamp && signature && secretKey) {
            const signatureString = timestamp + rawBody;
            const computedSignature = crypto
                .createHmac('sha256', secretKey)
                .update(signatureString)
                .digest('base64');

            if (computedSignature !== signature) {
                console.error('[CashfreeWebhook] Signature mismatch', { 
                    computed: computedSignature.substring(0, 20) + '...', 
                    received: signature.substring(0, 20) + '...',
                    secretKeyLength: secretKey.length 
                });
                return new Response('Invalid Signature', { status: 401 });
            }
            console.log('[CashfreeWebhook] Signature verified successfully');
        } else {
            console.warn('[CashfreeWebhook] Skipping signature verification - missing headers or secret');
        }

        // 2. Detect successful payment using correct Cashfree webhook structure
        const eventType = payload.type;
        const orderStatus = payload.data?.order?.order_status;
        const orderId = payload.data?.order?.order_id;

        // Only process PAYMENT_SUCCESS_WEBHOOK events with PAID status
        if (eventType !== 'PAYMENT_SUCCESS_WEBHOOK' || orderStatus !== 'PAID' || !orderId) {
            console.log('[CashfreeWebhook] Webhook not a successful payment event, acknowledging');
            return new Response('OK', { status: 200 });
        }

        console.log(`[CashfreeWebhook] Payment SUCCESS for order ${orderId}, processing asynchronously...`);

        // IMPORTANT: Process webhook asynchronously and return 200 immediately
        // This prevents timeout issues and ensures Cashfree receives acknowledgment quickly
        processWebhookAsync(orderId).catch((error) => {
            console.error('[CashfreeWebhook] Async processing error:', error);
        });

        // Return 200 immediately to acknowledge receipt
        // Cashfree requires 200 response within timeout window
        return new Response('OK', { status: 200 });
    } catch (error) {
        // Log error but still return 200 to acknowledge webhook receipt
        // Only return non-200 for signature verification failures (handled above)
        console.error('[CashfreeWebhook] Error handling webhook:', error);
        return new Response('OK', { status: 200 });
    }
}
