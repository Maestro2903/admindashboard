import { NextRequest } from 'next/server';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';

function toIso(val: unknown): string | null {
  if (val != null && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate()?.toISOString() ?? null;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const result = await requireOrganizer(req);
    if (result instanceof Response) return result;

    const { searchParams } = new URL(req.url);
    const includeArchived = searchParams.get('includeArchived') === '1';

    const db = getAdminFirestore();
    let snapshot;
    try {
      snapshot = await db.collection('passes').orderBy('createdAt', 'desc').get();
    } catch (error) {
      console.warn('Could not order passes by createdAt, fetching without order:', error);
      snapshot = await db.collection('passes').get();
    }

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
        paymentId: data.paymentId || null,
        usedAt: toIso(data.usedAt) || null,
        scannedBy: data.scannedBy || null,
        createdAt: toIso(data.createdAt) || null,
        teamId: data.teamId || null,
        isArchived: data.isArchived || false,
      };
    });

    return Response.json({ passes, count: passes.length });
  } catch (error) {
    console.error('Admin passes API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
