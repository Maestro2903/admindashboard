import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { rebuildAdminDashboardForUser } from '@/lib/admin/buildAdminDashboard';
import { createQRPayload } from '@/features/passes/qrService';
import { sendEmail, emailTemplates } from '@/features/email/emailService';
import { generatePassPDFBuffer } from '@/features/passes/pdfGenerator.server';
import { checkRateLimit } from '@/lib/security/rateLimiter';

/** Resolve eventIds from payment or from events that allow this passType. Returns eventIds and first event's category/type. */
async function resolveEventIdsAndMeta(
  db: ReturnType<typeof getAdminFirestore>,
  paymentData: Record<string, unknown>
): Promise<{ eventIds: string[]; eventCategory?: string; eventType?: string }> {
  const paymentEventIds = Array.isArray(paymentData.eventIds)
    ? (paymentData.eventIds as string[]).filter((x) => typeof x === 'string')
    : [];
  if (paymentEventIds.length > 0) {
    const first = await db.collection('events').doc(paymentEventIds[0]).get();
    const d = first.exists ? (first.data() as Record<string, unknown>) : null;
    return {
      eventIds: paymentEventIds,
      eventCategory: typeof d?.category === 'string' ? d.category : undefined,
      eventType: typeof d?.type === 'string' ? d.type : undefined,
    };
  }
  const passType = typeof paymentData.passType === 'string' ? paymentData.passType : '';
  if (!passType) return { eventIds: [] };
  const eventsSnap = await db
    .collection('events')
    .where('allowedPassTypes', 'array-contains', passType)
    .limit(50)
    .get();
  const eventIds = eventsSnap.docs.map((d) => d.id);
  const firstDoc = eventsSnap.docs[0];
  const d = firstDoc?.data() as Record<string, unknown> | undefined;
  return {
    eventIds,
    eventCategory: typeof d?.category === 'string' ? d.category : undefined,
    eventType: typeof d?.type === 'string' ? d.type : undefined,
  };
}

const CASHFREE_BASE =
  process.env.NEXT_PUBLIC_CASHFREE_ENV === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

export async function POST(req: NextRequest) {
  const rateLimitResponse = await checkRateLimit(req, { limit: 3, windowMs: 60000 });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const isWebhook = req.headers.get('x-system-webhook') === 'true';
    let organizerUid = 'system-webhook';

    if (!isWebhook) {
      const organizerResult = await requireOrganizer(req);
      if (organizerResult instanceof NextResponse) return organizerResult;
      organizerUid = organizerResult.uid;
    }

    const db = getAdminFirestore();
    const body = await req.json().catch((err) => {
      console.error('[FixPayment] Invalid JSON body:', err);
      return null;
    });

    const orderId =
      body && typeof body.orderId === 'string' ? body.orderId.trim() : '';

    console.log(
      `[FixPayment] Manual fix or webhook requested for: ${orderId || '<empty>'} by: ${organizerUid}`
    );

    if (!orderId) {
      console.error('[FixPayment] Invalid or missing orderId', { orderId });
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    const appId = process.env.NEXT_PUBLIC_CASHFREE_APP_ID || process.env.CASHFREE_APP_ID;
    const secret = process.env.CASHFREE_SECRET_KEY;

    if (!appId || !secret) {
      console.error('[FixPayment] Missing Cashfree credentials');
      return NextResponse.json({ error: 'Payment not configured' }, { status: 500 });
    }

    const response = await fetch(`${CASHFREE_BASE}/orders/${orderId}`, {
      headers: {
        'x-client-id': appId,
        'x-client-secret': secret,
        'x-api-version': '2025-01-01',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[FixPayment] Cashfree API error: ${response.status}`, errorText);
      return NextResponse.json(
        { error: `Cashfree API error: ${response.status}`, details: errorText },
        { status: 500 }
      );
    }

    const order = await response.json();
    if (order.order_status !== 'PAID') {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot fix: Payment status is ${order.order_status} (not PAID)`,
          cashfreeStatus: order.order_status,
        },
        { status: 400 }
      );
    }

    let paymentsSnapshot = await db
      .collection('payments')
      .where('cashfreeOrderId', '==', orderId)
      .limit(1)
      .get();

    // If not found in payments, check onspotPayments
    if (paymentsSnapshot.empty) {
      paymentsSnapshot = await db
        .collection('onspotPayments')
        .where('cashfreeOrderId', '==', orderId)
        .limit(1)
        .get();
    }

    if (paymentsSnapshot.empty) {
      return NextResponse.json(
        { error: 'Payment record not found in database', orderId },
        { status: 404 }
      );
    }

    const paymentDoc = paymentsSnapshot.docs[0];
    const paymentData = paymentDoc.data() as Record<string, unknown>;

    const paymentDocId = paymentDoc.id;
    if (!paymentDocId || typeof paymentDocId !== 'string') {
      console.error('[FixPayment] Invalid payment document id', {
        orderId,
        paymentDocId,
      });
      return NextResponse.json(
        { error: 'Invalid payment record id', orderId },
        { status: 500 }
      );
    }

    const userId =
      typeof paymentData.userId === 'string' && paymentData.userId.trim()
        ? paymentData.userId.trim()
        : undefined;
    const passType =
      typeof paymentData.passType === 'string' && paymentData.passType.trim()
        ? paymentData.passType.trim()
        : undefined;
    const amount =
      typeof paymentData.amount === 'number' ? paymentData.amount : undefined;
    const teamId =
      typeof paymentData.teamId === 'string' && paymentData.teamId.trim()
        ? paymentData.teamId.trim()
        : undefined;

    if (!userId) {
      console.error('[FixPayment] Invalid userId in payment record', {
        orderId,
        paymentDocId,
      });
      return NextResponse.json(
        { error: 'Invalid userId in payment record', orderId },
        { status: 500 }
      );
    }

    if (!passType) {
      console.error('[FixPayment] Invalid passType in payment record', {
        orderId,
        paymentDocId,
      });
      return NextResponse.json(
        { error: 'Invalid passType in payment record', orderId },
        { status: 500 }
      );
    }

    if (amount === undefined) {
      console.error('[FixPayment] Invalid amount in payment record', {
        orderId,
        paymentDocId,
      });
      return NextResponse.json(
        { error: 'Invalid amount in payment record', orderId },
        { status: 500 }
      );
    }

    if (paymentData.status !== 'success') {
      await paymentDoc.ref.update({
        status: 'success',
        updatedAt: new Date(),
        fixedManually: true,
      });
    }

    const existingPassSnapshot = await db
      .collection('passes')
      .where('paymentId', '==', orderId)
      .limit(1)
      .get();

    if (!existingPassSnapshot.empty) {
      const existingPass = existingPassSnapshot.docs[0];
      const existingPassData = existingPass.data() as Record<string, unknown>;
      const passEventIds = Array.isArray(existingPassData.eventIds)
        ? existingPassData.eventIds
        : Array.isArray(existingPassData.selectedEvents)
          ? existingPassData.selectedEvents
          : [];
      if (passEventIds.length > 0 && (!Array.isArray(paymentData.eventIds) || paymentData.eventIds.length === 0)) {
        await paymentDoc.ref.update({
          eventIds: passEventIds,
          updatedAt: new Date(),
        });
      }
      void rebuildAdminDashboardForUser(userId).catch((err) =>
        console.error('[FixPayment] rebuildAdminDashboard error:', err)
      );
      return NextResponse.json({
        success: true,
        message: 'Payment already processed (pass exists)',
        passId: existingPass.id,
        qrCode: existingPass.data().qrCode,
      });
    }

    const { eventIds: resolvedEventIds, eventCategory, eventType } = await resolveEventIdsAndMeta(db, paymentData);

    const passRef = db.collection('passes').doc();
    const qrData = createQRPayload(passRef.id, userId, passType);
    const qrCodeUrl = await QRCode.toDataURL(qrData);

    const passData: Record<string, unknown> = {
      userId,
      passType,
      amount,
      paymentId: orderId,
      status: 'paid',
      qrCode: qrCodeUrl,
      createdAt: new Date(),
      createdManually: true,
    };
    if (resolvedEventIds.length > 0) {
      passData.eventIds = resolvedEventIds;
      passData.selectedEvents = resolvedEventIds;
      if (eventCategory) passData.eventCategory = eventCategory;
      if (eventType) passData.eventType = eventType;
    }

    if (passType === 'group_events' && teamId) {
      try {
        const teamDoc = await db.collection('teams').doc(teamId).get();
        if (teamDoc.exists) {
          const teamData = teamDoc.data();
          passData.teamId = teamId;
          const teamSnapshot: Record<string, unknown> = {
            teamName: teamData?.teamName || '',
            totalMembers: teamData?.members?.length || 0,
            members: (teamData?.members || []).map((member: { memberId: string; name: string; phone: string; isLeader: boolean }) => ({
              memberId: member.memberId,
              name: member.name,
              phone: member.phone,
              isLeader: member.isLeader,
              checkedIn: false,
            })),
          };
          if (resolvedEventIds.length > 0) teamSnapshot.eventIds = resolvedEventIds;
          passData.teamSnapshot = teamSnapshot;

          const teamUpdate: Record<string, unknown> = {
            passId: passRef.id,
            paymentStatus: 'success',
            updatedAt: new Date(),
          };
          if (resolvedEventIds.length > 0) teamUpdate.eventIds = resolvedEventIds;
          await db.collection('teams').doc(teamId).update(teamUpdate);
        }
      } catch (teamError) {
        console.error('[FixPayment] Error fetching team:', teamError);
      }
    }

    await passRef.set(passData);

    if (resolvedEventIds.length > 0 && (!Array.isArray(paymentData.eventIds) || paymentData.eventIds.length === 0)) {
      await paymentDoc.ref.update({
        eventIds: resolvedEventIds,
        ...(eventCategory && { eventCategory }),
        ...(eventType && { eventType }),
        updatedAt: new Date(),
      });
    }

    void rebuildAdminDashboardForUser(userId).catch((err) =>
      console.error('[FixPayment] rebuildAdminDashboard error:', err)
    );

    const recipientUserDoc = await db.collection('users').doc(userId).get();
    const userData = recipientUserDoc.data();

    if (userData?.email) {
      const emailTemplate = emailTemplates.passConfirmation({
        name: userData.name ?? 'there',
        amount,
        passType,
        college: userData.college ?? '-',
        phone: userData.phone ?? '-',
        qrCodeUrl,
      });

      try {
        const pdfBuffer = await generatePassPDFBuffer({
          passType,
          amount,
          userName: userData.name ?? 'User',
          email: userData.email,
          phone: userData.phone ?? '-',
          college: userData.college ?? '-',
          qrCode: qrCodeUrl,
          teamName: (passData.teamSnapshot as { teamName?: string })?.teamName,
          members: (passData.teamSnapshot as { members?: Array<{ name: string; isLeader?: boolean }> })?.members,
        });

        await sendEmail({
          to: userData.email as string,
          subject: emailTemplate.subject,
          html: emailTemplate.html,
          attachments: [
            {
              filename: `takshashila-pass-${passType}.pdf`,
              content: pdfBuffer,
            },
          ],
        });
      } catch (emailError) {
        console.error('[FixPayment] Email error:', emailError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Payment fixed successfully',
      passId: passRef.id,
      qrCode: qrCodeUrl,
      details: {
        orderId,
        userId,
        passType,
        amount,
      },
    });
  } catch (error: unknown) {
    console.error('[FixPayment] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Server error',
        details: error instanceof Error ? error.stack : String(error),
      },
      { status: 500 }
    );
  }
}
