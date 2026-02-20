import { NextRequest } from 'next/server';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { verifySignedQR } from '@/features/passes/qrService';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

function getString(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key];
  return typeof v === 'string' ? v : undefined;
}

export async function POST(req: NextRequest) {
  // Route-level guard: 30 scans/min per organizer (mirrors Edge middleware layer).
  const rl = await rateLimitAdmin(req, 'scan');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireOrganizer(req);
    if (result instanceof Response) return result;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
    const token = payload ? (getString(payload, 'token') ?? (payload.token as string)) : null;

    if (!token || typeof token !== 'string') {
      return Response.json(
        { result: 'invalid', message: 'Missing or invalid token' },
        { status: 200 }
      );
    }

    const verification = verifySignedQR(token);
    if (!verification.valid) {
      return Response.json(
        { result: 'invalid', message: 'Invalid or expired token' },
        { status: 200 }
      );
    }

    const db = getAdminFirestore();
    const passDoc = await db.collection('passes').doc(verification.passId).get();

    if (!passDoc.exists) {
      return Response.json(
        { result: 'invalid', message: 'Pass not found' },
        { status: 200 }
      );
    }

    const passData = passDoc.data() as Record<string, unknown>;
    const status = passData.status;
    const usedAt = passData.usedAt;

    const passType = getString(passData, 'passType');
    const teamSnapshot = passData.teamSnapshot && typeof passData.teamSnapshot === 'object'
      ? passData.teamSnapshot as Record<string, unknown>
      : null;
    const teamName = teamSnapshot ? getString(teamSnapshot, 'teamName') : undefined;
    const members = teamSnapshot && Array.isArray(teamSnapshot.members)
      ? teamSnapshot.members as unknown[]
      : undefined;
    const memberCount = members?.length;

    if (status === 'used' || usedAt) {
      const userId = getString(passData, 'userId') ?? '';
      const userDoc = userId ? await db.collection('users').doc(userId).get() : null;
      const userData = userDoc?.exists ? (userDoc.data() as Record<string, unknown>) : null;
      const name = userData ? getString(userData, 'name') : undefined;

      return Response.json({
        result: 'already_used',
        passId: verification.passId,
        name,
        passType,
        teamName,
        memberCount,
        message: 'Pass already used',
      });
    }

    const userId = getString(passData, 'userId') ?? '';
    const userDoc = userId ? await db.collection('users').doc(userId).get() : null;
    const userData = userDoc?.exists ? (userDoc.data() as Record<string, unknown>) : null;
    const name = userData ? getString(userData, 'name') : undefined;

    return Response.json({
      result: 'valid',
      passId: verification.passId,
      name,
      passType,
      teamName,
      memberCount,
      message: 'Valid',
    });
  } catch (error) {
    console.error('Scan verify API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
