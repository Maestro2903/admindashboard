import { GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, getAuthSafe } from '@/lib/firebase/clientApp';

const FIREBASE_NOT_CONFIGURED =
  'Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, and NEXT_PUBLIC_FIREBASE_PROJECT_ID to .env.local';

export async function signInWithGoogle() {
  const realAuth = getAuthSafe();
  if (!realAuth) {
    throw new Error(FIREBASE_NOT_CONFIGURED);
  }

  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');

  try {
    return await signInWithPopup(realAuth, provider);
  } catch (error: unknown) {
    const err = error as { code?: string };
    switch (err?.code) {
      case 'auth/popup-blocked':
        throw new Error('Popup was blocked. Please enable popups for this site and try again.');
      case 'auth/popup-closed-by-user':
        throw new Error('Sign-in cancelled before completion.');
      case 'auth/network-request-failed':
        throw new Error('Network error during sign-in. Please check your connection and try again.');
      case 'auth/unauthorized-domain':
        throw new Error('This domain is not authorized for Google sign-in. Please contact support.');
      default:
        throw error;
    }
  }
}

export async function signInWithGoogleRedirect() {
  const realAuth = getAuthSafe();
  if (!realAuth) {
    throw new Error(FIREBASE_NOT_CONFIGURED);
  }

  const { signInWithRedirect } = await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');

  return await signInWithRedirect(realAuth, provider);
}

export async function signOut() {
  const realAuth = getAuthSafe();
  if (!realAuth) return;
  return await firebaseSignOut(realAuth);
}
