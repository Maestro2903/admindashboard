import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/adminApp';

export type OrganizerContext = { uid: string };

export async function requireOrganizer(
  req: NextRequest
): Promise<OrganizerContext | NextResponse> {
  const authHeader = req.headers.get('Authorization');
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!idToken) {
    return NextResponse.json(
      { error: 'Unauthorized: No authentication token provided' },
      { status: 401 }
    );
  }

  let decoded: { uid: string };
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken);
  } catch (tokenError: unknown) {
    const err = tokenError as { code?: string; message?: string };
    console.error('[requireOrganizer] Token verification failed:', {
      code: err?.code,
      message: err?.message,
      tokenLength: idToken.length,
    });
    const isExpired = err?.code === 'auth/id-token-expired';
    return NextResponse.json(
      {
        error: isExpired
          ? 'Session expired. Please sign in again.'
          : `Invalid token: ${err?.code || err?.message || 'Unknown error'}`,
      },
      { status: 401 }
    );
  }

  const db = getAdminFirestore();
  const userDoc = await db.collection('users').doc(decoded.uid).get();
  if (!userDoc.exists || !userDoc.data()?.isOrganizer) {
    return NextResponse.json(
      { error: 'Forbidden: Organizer access required' },
      { status: 403 }
    );
  }

  return { uid: decoded.uid };
}
