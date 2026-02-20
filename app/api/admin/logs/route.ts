import { NextRequest } from 'next/server';
import { requireAdminRole } from '@/lib/admin/requireAdminRole';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import { rateLimitAdmin, rateLimitResponse } from '@/lib/security/adminRateLimiter';

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const maybe = value as { toDate?: () => Date };
  if (typeof maybe?.toDate === 'function') return maybe.toDate().toISOString();
  return null;
}

export async function GET(req: NextRequest) {
  const rl = await rateLimitAdmin(req, 'dashboard');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const result = await requireAdminRole(req);
    if (result instanceof Response) return result;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200);

    const db = getAdminFirestore();
    const snap = await db
      .collection('admin_logs')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    const logs = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        adminId: data.adminId ?? '',
        action: data.action ?? '',
        targetCollection: data.targetCollection ?? '',
        targetId: data.targetId ?? '',
        previousData: data.previousData ?? null,
        newData: data.newData ?? null,
        ipAddress: data.ipAddress ?? null,
        timestamp: toIso(data.timestamp) ?? new Date().toISOString(),
      };
    });

    return Response.json({ logs });
  } catch (error) {
    console.error('Admin logs API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
