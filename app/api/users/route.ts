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
      snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
    } catch (error) {
      console.warn('Could not order by createdAt, fetching without order:', error);
      snapshot = await db.collection('users').get();
    }

    let docs = snapshot.docs;
    if (!includeArchived) {
      docs = docs.filter((doc) => doc.data()?.isArchived !== true);
    }

    const users = docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        name: data.name || null,
        email: data.email || null,
        college: data.college || null,
        phone: data.phone || null,
        isOrganizer: data.isOrganizer || false,
        createdAt: toIso(data.createdAt) || null,
        updatedAt: toIso(data.updatedAt) || null,
        referralCode: data.referralCode || null,
        inviteCount: data.inviteCount || 0,
        dayPassUnlocked: data.dayPassUnlocked || false,
        isArchived: data.isArchived || false,
      };
    });

    return Response.json({ users, count: users.length });
  } catch (error) {
    console.error('Admin users API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
