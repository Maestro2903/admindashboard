import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';

interface UseMeRoleOptions {
  user: User | null;
  hasAccess: boolean;
  signOut: () => Promise<void>;
  onUnauthorized: () => void;
}

/**
 * Fetches the current user's adminRole from /api/me.
 * Handles 401 token refresh, signs out on persistent auth failure.
 */
export function useMeRole({ user, hasAccess, signOut, onUnauthorized }: UseMeRoleOptions) {
  const [adminRole, setAdminRole] = useState<string | undefined>(undefined);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!hasAccess || !user) return;
    // Reset on user change
    hasFetched.current = false;
  }, [user, hasAccess]);

  useEffect(() => {
    if (!hasAccess || !user || hasFetched.current) return;
    let cancelled = false;
    hasFetched.current = true;

    const doFetch = async () => {
      let idToken = await user.getIdToken(false);
      if (cancelled) return;

      let res = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (res.status === 401 && !cancelled) {
        idToken = await user.getIdToken(true);
        if (cancelled) return;
        res = await fetch('/api/me', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
      }

      if (!cancelled && !res.ok) {
        await signOut();
        onUnauthorized();
        return;
      }

      const data = await res.json().catch(() => null);
      if (!cancelled && data?.adminRole) {
        setAdminRole(data.adminRole);
      }
    };

    doFetch().catch(async () => {
      if (!cancelled) {
        await signOut();
        onUnauthorized();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hasAccess, user, signOut, onUnauthorized]);

  return adminRole;
}
