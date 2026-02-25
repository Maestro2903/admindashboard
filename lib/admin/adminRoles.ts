import type { AdminRole } from '@/types/admin';

/** Canonical admin roles stored in Firestore on users/{uid}.adminRole. */
export const VALID_ROLES: AdminRole[] = ['viewer', 'manager', 'superadmin'];

/**
 * Normalize a raw role value from Firestore into a safe AdminRole.
 *
 * - 'viewer'  → Viewer (read-only)
 * - 'manager' → Editor-level operational admin (can mutate passes/teams)
 * - 'superadmin' → Super Admin (full financial & system control)
 *
 * Any missing/invalid value is treated as 'viewer' (safe default).
 */
export function parseRole(value: unknown): AdminRole {
  if (typeof value === 'string' && VALID_ROLES.includes(value as AdminRole)) {
    return value as AdminRole;
  }
  // SECURITY: Missing or invalid role defaults to 'viewer' (read-only).
  // Only explicit 'manager' or 'superadmin' in Firestore grants mutation capabilities.
  return 'viewer';
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

/** Viewer-or-above (any valid admin role). Useful for explicit checks. */
export function requireViewerOrAbove(role: AdminRole): boolean {
  return VALID_ROLES.includes(role);
}

/** Editor-or-above (manager or superadmin). Maps to \"Editor\" in product copy. */
export function requireEditorOrAbove(role: AdminRole): boolean {
  return role === 'manager' || role === 'superadmin';
}

/** Super Admin only. */
export function requireSuperAdmin(role: AdminRole): boolean {
  return role === 'superadmin';
}
