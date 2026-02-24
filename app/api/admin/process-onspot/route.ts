import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import {
  requireAdminRole,
  canMutateUsersPaymentsEvents,
  forbiddenRole,
} from '@/lib/admin/requireAdminRole';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';
import { logAdminAction } from '@/lib/admin/adminLogger';

const bodySchema = z.object({
  registrationId: z.string().min(1),
  notes: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const rl = await rateLimitAdmin(req, 'mutation');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const ctx = await requireAdminRole(req);
    if (ctx instanceof Response) return ctx;
    if (!canMutateUsersPaymentsEvents(ctx.adminRole)) return forbiddenRole();

    let parsedBody: unknown;
    try {
      parsedBody = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parse = bodySchema.safeParse(parsedBody);
    if (!parse.success) {
      return Response.json(
        { error: 'Validation failed', issues: parse.error.issues },
        { status: 400 }
      );
    }

    const { registrationId, notes } = parse.data;
    const db = getAdminFirestore();

    const regRef = db.collection('registrations').doc(registrationId);
    const regSnap = await regRef.get();
    if (!regSnap.exists) {
      return Response.json({ error: 'Registration not found' }, { status: 404 });
    }

    const previousData = regSnap.data() as Record<string, unknown>;
    const status = (previousData.status as string) ?? 'pending';
    if (status !== 'pending') {
      return Response.json(
        { error: 'Only pending registrations can be converted' },
        { status: 400 }
      );
    }

    // Derive amount according to your rules:
    // - day_pass → 500
    // - sana_concert → 2000
    // - group_events → use calculatedAmount/amount from registration
    const passType = (previousData.passType as string) ?? '';
    let amount: number;
    if (passType === 'day_pass') {
      amount = 500;
    } else if (passType === 'sana_concert') {
      amount = 2000;
    } else {
      const amountRaw =
        typeof previousData.calculatedAmount === 'number'
          ? previousData.calculatedAmount
          : Number(previousData.amount);
      amount = Number.isFinite(amountRaw) ? Number(amountRaw) : 0;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json(
        { error: 'Invalid or missing amount on registration' },
        { status: 400 }
      );
    }

    const externalUrl = process.env.ONSPOT_REGISTRATION_PAYMENT_SERVICE_URL;
    if (!externalUrl) {
      return Response.json(
        {
          error:
            'ONSPOT_REGISTRATION_PAYMENT_SERVICE_URL is not configured. Set it to your main app endpoint that creates Cashfree orders.',
        },
        { status: 500 }
      );
    }

    const payload = {
      registrationId,
      userId: previousData.userId ?? null,
      passType,
      amount,
      notes: notes ?? null,
      source: 'admin-registrations',
    };

    const externalRes = await fetch(externalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const externalData = await externalRes.json().catch(() => ({}));
    if (!externalRes.ok) {
      const message =
        (externalData as { error?: string }).error ??
        `Upstream payment service error: ${externalRes.status}`;
      return Response.json({ error: message }, { status: 502 });
    }

    const paymentLinkUrl: string | undefined = (externalData as { paymentLinkUrl?: string }).paymentLinkUrl;
    const cashfreeOrderId: string | undefined = (externalData as { cashfreeOrderId?: string; orderId?: string })
      .cashfreeOrderId ?? (externalData as { orderId?: string }).orderId;

    if (!paymentLinkUrl) {
      return Response.json(
        { error: 'Payment service did not return paymentLinkUrl' },
        { status: 502 }
      );
    }

    // Optionally record that an on-spot payment attempt was initiated.
    const paymentDoc = {
      registrationId,
      userId: previousData.userId ?? null,
      amount,
      status: 'pending',
      cashfreeOrderId: cashfreeOrderId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      notes: notes ?? null,
      source: 'admin-registrations',
    };
    const paymentRef = await db.collection('onspotPayments').add(paymentDoc);

    const ipAddress =
      req.headers.get('x-forwarded-for') ??
      req.headers.get('x-real-ip') ??
      undefined;
    const ip = typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : undefined;

    await logAdminAction(db, {
      adminId: ctx.uid,
      action: 'process-onspot',
      targetCollection: 'registrations',
      targetId: registrationId,
      previousData,
      newData: {
        ...previousData,
        lastOnspotPaymentId: paymentRef.id,
        lastOnspotCreatedAt: new Date(),
      },
      ipAddress: ip,
    });

    return Response.json({
      success: true,
      registrationId,
      cashfreeOrderId,
      paymentLinkUrl,
    });
  } catch (error) {
    console.error('Process onspot registration API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}

