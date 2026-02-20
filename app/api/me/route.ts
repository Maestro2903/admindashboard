import { NextRequest } from 'next/server';
import { requireOrganizer } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';

export async function GET(req: NextRequest) {
  const result = await requireOrganizer(req);
  if (result instanceof Response) return result;

  const db = getAdminFirestore();
  const userDoc = await db.collection('users').doc(result.uid).get();
  const data = userDoc.data();
  if (!userDoc.exists || !data) {
    return Response.json({ error: 'Profile not found' }, { status: 404 });
  }

  const adminRole = typeof data.adminRole === 'string' && ['viewer', 'manager', 'superadmin'].includes(data.adminRole)
    ? data.adminRole
    : null;

  return Response.json({
    uid: result.uid,
    email: data.email ?? null,
    name: data.name ?? null,
    isOrganizer: true,
    adminRole,
  });
}
