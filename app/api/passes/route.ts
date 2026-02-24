import { NextRequest } from 'next/server';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';

function toIso(val: unknown): string | null {
  if (val != null && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate()?.toISOString() ?? null;
  }
  return null;
}

function clampPageSize(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export async function GET(req: NextRequest) {
  try {
    const result = await requireOrganizer(req);
    if (result instanceof Response) return result;

    const { searchParams } = new URL(req.url);
    const includeArchived = searchParams.get('includeArchived') === '1';
    const cursor = searchParams.get('cursor');
    const pageSize = clampPageSize(searchParams.get('pageSize'), 50, 10, 200);

    const db = getAdminFirestore();

    // STEP 2: Firestore-native pagination with orderBy + limit + startAfter
    let query = db.collection('passes').orderBy('createdAt', 'desc').limit(pageSize);

    if (cursor) {
      try {
        const cursorDoc = await db.collection('passes').doc(cursor).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      } catch (err) {
        console.warn('Failed to apply passes cursor:', err);
      }
    }

    const snapshot = await query.get();

    let docs = snapshot.docs;
    if (!includeArchived) {
      docs = docs.filter((doc) => (doc.data() as Record<string, unknown>).isArchived !== true);
    }

    const passes = docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        userId: data.userId || null,
        passType: data.passType || null,
        amount: Number(data.amount) || 0,
        status: data.status || null,
        // STEP 4: paymentId MUST reference payments document ID (not cashfreeOrderId)
        paymentId: data.paymentId || null,
        usedAt: toIso(data.usedAt) || null,
        scannedBy: data.scannedBy || null,
        createdAt: toIso(data.createdAt) || null,
        teamId: data.teamId || null,
        isArchived: data.isArchived || false,
      };
    });

    const lastDoc = docs[docs.length - 1];
    const nextCursor = docs.length === pageSize && lastDoc ? lastDoc.id : null;

    return Response.json({ passes, count: passes.length, nextCursor });
  } catch (error) {
    console.error('Admin passes API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
