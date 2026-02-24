import { NextRequest } from 'next/server';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';
import { getEventIdsFromPayment } from '@/lib/events/eventResolution';

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
  const rl = await rateLimitAdmin(req, 'dashboard');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireOrganizer(req);
    if (result instanceof Response) return result;

    const { searchParams } = new URL(req.url);
    const includeArchived = searchParams.get('includeArchived') === '1';
    const eventId = searchParams.get('eventId')?.trim() || null;
    const eventCategory = searchParams.get('eventCategory')?.trim() || null;
    const eventType = searchParams.get('eventType')?.trim() || null;
    const cursor = searchParams.get('cursor');
    const pageSize = clampPageSize(searchParams.get('pageSize'), 50, 10, 200);

    const db = getAdminFirestore();

    // STEP 2: Firestore-native pagination with orderBy + limit + startAfter
    // STEP 3: payments.status === 'success' is the ONLY source of truth for financial validity
    let query = db.collection('payments').orderBy('createdAt', 'desc').limit(pageSize);

    if (cursor) {
      try {
        const cursorDoc = await db.collection('payments').doc(cursor).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      } catch (err) {
        console.warn('Failed to apply payments cursor:', err);
      }
    }

    const snapshot = await query.get();

    // Filter in-memory (Firestore doesn't support != efficiently)
    let docs = snapshot.docs;
    if (!includeArchived) {
      docs = docs.filter((doc) => (doc.data() as Record<string, unknown>).isArchived !== true);
    }
    if (eventId || eventCategory || eventType) {
      docs = docs.filter((doc) => {
        const data = doc.data() as Record<string, unknown>;
        if (eventId) {
          const ids = getEventIdsFromPayment(data);
          if (!ids.includes(eventId)) return false;
        }
        if (eventCategory && (data.eventCategory as string) !== eventCategory) return false;
        if (eventType && (data.eventType as string) !== eventType) return false;
        return true;
      });
    }

    const userIds = [...new Set(
      docs.map((doc) => (doc.data() as Record<string, unknown>).userId as string).filter(Boolean)
    )];
    const usersById = new Map<string, { name: string; email: string }>();
    if (userIds.length > 0) {
      const userSnaps = await Promise.all(
        userIds.map((id) => db.collection('users').doc(id).get())
      );
      userSnaps.forEach((snap, i) => {
        if (snap.exists && userIds[i]) {
          const d = snap.data() as Record<string, unknown>;
          usersById.set(userIds[i], {
            name: (typeof d.name === 'string' ? d.name : '') || '—',
            email: (typeof d.email === 'string' ? d.email : '') || '—',
          });
        }
      });
    }

    const payments = docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const uid = (data.userId as string) || null;
      const user = uid ? usersById.get(uid) : null;
      // STEP 3: Only payments.status defines validity - ignore any payment.success boolean
      const status = (data.status as string) || 'pending';
      return {
        id: doc.id,
        userId: uid,
        name: user?.name ?? '—',
        email: user?.email ?? '—',
        amount: Number(data.amount) || 0,
        status, // CANONICAL: 'success' | 'pending' | 'failed'
        passType: data.passType || null,
        cashfreeOrderId: data.cashfreeOrderId || null,
        createdAt: toIso(data.createdAt) || null,
        updatedAt: toIso(data.updatedAt) || null,
        isArchived: data.isArchived || false,
      };
    });

    const lastDoc = docs[docs.length - 1];
    const nextCursor = docs.length === pageSize && lastDoc ? lastDoc.id : null;

    return Response.json({ payments, count: payments.length, nextCursor });
  } catch (error) {
    console.error('Admin payments API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
