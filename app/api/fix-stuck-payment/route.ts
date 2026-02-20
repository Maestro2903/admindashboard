import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { rebuildAdminDashboardForUser } from '@/lib/admin/buildAdminDashboard';
import { createQRPayload } from '@/features/passes/qrService';
import { sendEmail, emailTemplates } from '@/features/email/emailService';
import { generatePassPDFBuffer } from '@/features/passes/pdfGenerator.server';
import { checkRateLimit } from '@/lib/security/rateLimiter';

const CASHFREE_BASE =
  process.env.NEXT_PUBLIC_CASHFREE_ENV === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

export async function POST(req: NextRequest) {
  const rateLimitResponse = await checkRateLimit(req, { limit: 3, windowMs: 60000 });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const organizerResult = await requireOrganizer(req);
    if (organizerResult instanceof NextResponse) return organizerResult;
    const { uid: organizerUid } = organizerResult;

    const db = getAdminFirestore();
    const { orderId } = await req.json();
    console.log(`[FixPayment] Manual fix requested for: ${orderId} by organizer: ${organizerUid}`);

    if (!orderId || typeof orderId !== 'string') {
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

    const paymentsSnapshot = await db
      .collection('payments')
      .where('cashfreeOrderId', '==', orderId)
      .limit(1)
      .get();

    if (paymentsSnapshot.empty) {
      return NextResponse.json(
        { error: 'Payment record not found in database', orderId },
        { status: 404 }
      );
    }

    const paymentDoc = paymentsSnapshot.docs[0];
    const paymentData = paymentDoc.data();

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
      void rebuildAdminDashboardForUser(paymentData.userId).catch((err) =>
        console.error('[FixPayment] rebuildAdminDashboard error:', err)
      );
      return NextResponse.json({
        success: true,
        message: 'Payment already processed (pass exists)',
        passId: existingPass.id,
        qrCode: existingPass.data().qrCode,
      });
    }

    const passRef = db.collection('passes').doc();
    const qrData = createQRPayload(passRef.id, paymentData.userId, paymentData.passType);
    const qrCodeUrl = await QRCode.toDataURL(qrData);

    const passData: Record<string, unknown> = {
      userId: paymentData.userId,
      passType: paymentData.passType,
      amount: paymentData.amount,
      paymentId: orderId,
      status: 'paid',
      qrCode: qrCodeUrl,
      createdAt: new Date(),
      createdManually: true,
    };

    if (paymentData.passType === 'group_events' && paymentData.teamId) {
      try {
        const teamDoc = await db.collection('teams').doc(paymentData.teamId).get();
        if (teamDoc.exists) {
          const teamData = teamDoc.data();
          passData.teamId = paymentData.teamId;
          passData.teamSnapshot = {
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

          await db.collection('teams').doc(paymentData.teamId).update({
            passId: passRef.id,
            paymentStatus: 'success',
            updatedAt: new Date(),
          });
        }
      } catch (teamError) {
        console.error('[FixPayment] Error fetching team:', teamError);
      }
    }

    await passRef.set(passData);

    void rebuildAdminDashboardForUser(paymentData.userId).catch((err) =>
      console.error('[FixPayment] rebuildAdminDashboard error:', err)
    );

    const recipientUserDoc = await db.collection('users').doc(paymentData.userId as string).get();
    const userData = recipientUserDoc.data();

    if (userData?.email) {
      const emailTemplate = emailTemplates.passConfirmation({
        name: userData.name ?? 'there',
        amount: paymentData.amount,
        passType: paymentData.passType,
        college: userData.college ?? '-',
        phone: userData.phone ?? '-',
        qrCodeUrl,
      });

      try {
        const pdfBuffer = await generatePassPDFBuffer({
          passType: paymentData.passType,
          amount: paymentData.amount,
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
              filename: `takshashila-pass-${paymentData.passType}.pdf`,
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
        userId: paymentData.userId,
        passType: paymentData.passType,
        amount: paymentData.amount,
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
