import { NextRequest, NextResponse } from 'next/server';
import { requireOrganizer, type OrganizerContext } from '@/lib/admin/requireOrganizer';
import { getAdminFirestore } from '@/lib/firebase/adminApp';
import type { AdminRole } from '@/types/admin';

export type AdminContext = OrganizerContext & { adminRole: AdminRole };

const VALID_ROLES: AdminRole[] = ['viewer', 'manager', 'superadmin'];

function parseRole(value: unknown): AdminRole {
  if (typeof value === 'string' && VALID_ROLES.includes(value as AdminRole)) {
    return value as AdminRole;
  }
  // Default to manager so organizers can mutate passes/teams without explicit role in Firestore.
  // Set adminRole to 'viewer' on users/{uid} to restrict to read-only.
  return 'manager';
}

/**
 * Requires organizer and resolves adminRole from users/{uid}.adminRole.
 * Default role is 'viewer' if missing. Use for mutation routes that need role checks.
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

/** True if role can mutate passes (mark used, revert, soft delete, update-pass). */
export function canMutatePasses(role: AdminRole): boolean {
  return role === 'manager' || role === 'superadmin';
}

/** True if role can mutate teams (update-team, bulk team actions). */
export function canMutateTeams(role: AdminRole): boolean {
  return role === 'manager' || role === 'superadmin';
}

/** True if role can mutate users, payments, events (update-user, update-payment, update-event). */
export function canMutateUsersPaymentsEvents(role: AdminRole): boolean {
  return role === 'superadmin';
}

/** Returns 403 response for insufficient role. */
export function forbiddenRole(): NextResponse {
  return NextResponse.json(
    { error: 'Forbidden: Insufficient admin role' },
    { status: 403 }
  );
}
