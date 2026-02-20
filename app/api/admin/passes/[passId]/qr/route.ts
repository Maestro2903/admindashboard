import { NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { createQRPayload } from '@/features/passes/qrService';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

function getString(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key];
  return typeof v === 'string' ? v : undefined;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ passId: string }> }
) {
  const rl = await rateLimitAdmin(req, 'dashboard');
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
    const userId = getString(passData, 'userId') ?? '';
    const passType = getString(passData, 'passType') ?? '';

    const qrPayload = createQRPayload(passId, userId, passType);
    const qrCodeUrl = await QRCode.toDataURL(qrPayload, {
      margin: 2,
      width: 256,
      color: { dark: '#000000', light: '#ffffff' },
    });

    return Response.json({
      passId,
      qrCodeUrl,
    });
  } catch (error) {
    console.error('Pass QR API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
