import { NextRequest } from 'next/server';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

export async function GET(req: NextRequest) {
  const rl = await rateLimitAdmin(req, 'dashboard');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireOrganizer(req);
    if (result instanceof Response) return result;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100);
    const cursor = searchParams.get('cursor') || null;
    const college = searchParams.get('college') || null;
    const passType = searchParams.get('passType') || null;
    const paymentStatus = searchParams.get('paymentStatus') || null;

    const db = getAdminFirestore();

    let query = db
      .collection('admin_dashboard')
      .orderBy('updatedAt', 'desc')
      .limit(limit);

    if (college) {
      query = query.where('profile.college', '==', college);
    } else if (passType) {
      query = query.where('filterPassTypes', 'array-contains', passType);
    } else if (paymentStatus) {
      query = query.where('filterPaymentStatuses', 'array-contains', paymentStatus);
    }

    if (cursor) {
      const cursorDoc = await db.collection('admin_dashboard').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const docs = snapshot.docs;

    const documents = docs.map((doc) => {
      const data = doc.data();
      return {
        userId: doc.id,
        ...data,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
        profile: data.profile
          ? {
              ...data.profile,
              createdAt: data.profile.createdAt?.toDate?.()?.toISOString() ?? null,
            }
          : null,
        payments: (data.payments || []).map((p: { createdAt?: { toDate?: () => Date } }) => ({
          ...p,
          createdAt: p.createdAt?.toDate?.()?.toISOString() ?? null,
        })),
        passes: (data.passes || []).map((p: { createdAt?: { toDate?: () => Date }; usedAt?: { toDate?: () => Date } }) => ({
          ...p,
          createdAt: p.createdAt?.toDate?.()?.toISOString() ?? null,
          usedAt: p.usedAt?.toDate?.()?.toISOString() ?? null,
        })),
      };
    });

    const lastDoc = docs[docs.length - 1];
    const nextCursor = lastDoc && docs.length === limit ? lastDoc.id : null;

    return Response.json({
      documents,
      nextCursor,
      count: documents.length,
    });
  } catch (error) {
    console.error('Admin dashboard API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
