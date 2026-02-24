import type { AdminRole } from '@/types/admin';

export const VALID_ROLES: AdminRole[] = ['viewer', 'manager', 'superadmin'];

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
