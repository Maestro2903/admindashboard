import { NextRequest, NextResponse } from 'next/server';
import { requireOrganizer, type OrganizerContext } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import type { AdminRole } from '@/types/admin';
import { parseRole } from './adminRoles';

export type AdminContext = OrganizerContext & { adminRole: AdminRole };

export * from './adminRoles';

/**
 * Requires organizer and resolves adminRole from users/{uid}.adminRole.
 * Default role is 'viewer' if missing/invalid. Use for mutation routes that need role checks.
 */
export async function requireAdminRole(
  req: NextRequest
): Promise<AdminContext | NextResponse> {
  const organizer = await requireOrganizer(req);
  if (organizer instanceof Response) return organizer;

  const db = getAdminFirestore();
  const userDoc = await db.collection('users').doc(organizer.uid).get();
  const data = userDoc.exists ? (userDoc.data() as Record<string, unknown>) : null;
  const adminRole = parseRole(data?.adminRole);

  return { uid: organizer.uid, adminRole };
}

/** Returns 403 response for insufficient role. */
export function forbiddenRole(): NextResponse {
  return NextResponse.json(
    { error: 'Forbidden: Insufficient admin role' },
    { status: 403 }
  );
}
