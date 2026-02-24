'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { getAuthSafe } from '@/lib/firebase/clientApp';
import { signInWithGoogle, signOut as authSignOut } from '@/features/auth/authService';
import type { UserProfile, UserProfileUpdate } from '@/lib/db/firestoreTypes';

interface AuthContextValue {
  user: User | null;
  userData: UserProfile | null;
  loading: boolean;
  signIn: () => Promise<unknown>;
  signOut: () => Promise<void>;
  updateUserProfile: (data: UserProfileUpdate) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(() => Boolean(getAuthSafe()));

  const fetchUserProfile = useCallback(async (u: User) => {
    try {
      let idToken = await u.getIdToken(false);
      let res = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.status === 401) {
        idToken = await u.getIdToken(true);
        res = await fetch('/api/me', { headers: { Authorization: `Bearer ${idToken}` } });
      }
      if (!res.ok) {
        setUserData(null);
        return;
      }
      const data = await res.json();
      setUserData({
        uid: data.uid ?? u.uid,
        name: data.name ?? '',
        email: data.email ?? null,
        college: '',
        phone: '',
        isOrganizer: data.isOrganizer ?? false,
        adminRole: data.adminRole ?? undefined,
      } as UserProfile);
    } catch (err) {
      console.error('Error fetching user profile:', err);
      setUserData(null);
    }
  }, []);

  useEffect(() => {
    const authInstance = getAuthSafe();
    if (!authInstance) {
      return;
    }

    let isSubscribed = true;
    const unsubRef: { current: (() => void) | null } = { current: null };

    const init = async () => {
      try {
        await getRedirectResult(authInstance);
      } catch (error: unknown) {
        const err = error as { code?: string };
        console.error('Redirect result error:', error);
        if (err?.code === 'auth/network-request-failed') {
          alert('Network error. Please check your connection and try again.');
        } else if (err?.code !== 'auth/popup-closed-by-user') {
          alert('Sign-in failed. Please try again.');
        }
      }

      if (!isSubscribed) return;

      unsubRef.current = onAuthStateChanged(authInstance, async (u) => {
        if (!isSubscribed) return;
        setUser(u);
        if (u) {
          await fetchUserProfile(u);
        } else {
          setUserData(null);
        }
        setLoading(false);
      });
    };

    init();

    return () => {
      isSubscribed = false;
      if (unsubRef.current) unsubRef.current();
    };
  }, [fetchUserProfile]);

  const signIn = useCallback(async () => {
    try {
      return await signInWithGoogle();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Sign-in failed. Check the console for details.';
      if (typeof window !== 'undefined' && msg.includes('Firebase is not configured')) {
        alert(
          'Google sign-in is not configured. Add NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, and NEXT_PUBLIC_FIREBASE_PROJECT_ID to .env.local.'
        );
      } else {
        throw err;
      }
    }
  }, []);

  const signOut = useCallback(() => authSignOut(), []);

  const updateUserProfile = useCallback(async (data: UserProfileUpdate) => {
    void data;
    throw new Error('Profile updates not supported in admin dashboard');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, userData, loading, signIn, signOut, updateUserProfile }),
    [user, userData, loading, signIn, signOut, updateUserProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
