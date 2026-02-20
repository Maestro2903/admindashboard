import { NextRequest } from 'next/server';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

function getString(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key];
  return typeof v === 'string' ? v : undefined;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ passId: string }> }
) {
  const rl = await rateLimitAdmin(req, 'mutation');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireOrganizer(req);
    if (result instanceof Response) return result;

    const { passId } = await params;
    if (!passId) {
      return Response.json({ error: 'Missing passId' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const passSnap = await db.collection('passes').doc(passId).get();

    if (!passSnap.exists) {
      return Response.json({ error: 'Pass not found' }, { status: 404 });
    }

    const passData = passSnap.data() as Record<string, unknown>;
    const orderId = getString(passData, 'paymentId');

    if (!orderId) {
      return Response.json(
        { error: 'Pass has no linked payment (orderId)' },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get('Authorization');
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : req.nextUrl?.origin ?? 'http://localhost:3000';

    const fixRes = await fetch(`${baseUrl}/api/fix-stuck-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({ orderId }),
    });

    const data = await fixRes.json().catch(() => ({}));

    if (!fixRes.ok) {
      return Response.json(
        { error: (data as { error?: string }).error ?? 'Fix payment failed' },
        { status: fixRes.status }
      );
    }

    return Response.json({
      success: true,
      message: (data as { message?: string }).message ?? 'Payment fix requested',
      passId: (data as { passId?: string }).passId ?? passId,
    });
  } catch (error) {
    console.error('Fix payment by pass API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
