import { NextRequest } from 'next/server';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';

function toIso(val: unknown): string | null {
  if (
    val != null &&
    typeof val === 'object' &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
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
    let query = db.collection('users').orderBy('createdAt', 'desc').limit(pageSize);

    if (cursor) {
      try {
        const cursorDoc = await db.collection('users').doc(cursor).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      } catch (err) {
        console.warn('Failed to apply users cursor, falling back to first page:', err);
      }
    }

    // STEP 2: Filter archived at query level if possible, else in-memory
    // Note: Firestore doesn't support != queries efficiently, so we filter in-memory
    const snapshot = await query.get();

    let docs = snapshot.docs;
    if (!includeArchived) {
      docs = docs.filter((doc) => doc.data()?.isArchived !== true);
    }

    const users = docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        name: (data.name as string) ?? null,
        email: (data.email as string) ?? null,
        college: (data.college as string) ?? null,
        phone: (data.phone as string) ?? null,
        isOrganizer: Boolean(data.isOrganizer),
        createdAt: toIso(data.createdAt) || null,
        updatedAt: toIso(data.updatedAt) || null,
        referralCode: (data.referralCode as string) ?? null,
        inviteCount: (typeof data.inviteCount === 'number' ? data.inviteCount : 0) ?? 0,
        dayPassUnlocked: Boolean(data.dayPassUnlocked),
        isArchived: Boolean(data.isArchived),
      };
    });

    const lastDoc = docs[docs.length - 1];
    const nextCursor = docs.length === pageSize && lastDoc ? lastDoc.id : null;

    return Response.json({ users, count: users.length, nextCursor });
  } catch (error) {
    console.error('Admin users API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
