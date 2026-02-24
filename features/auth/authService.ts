import { GoogleAuthProvider, signInWithRedirect, signOut as firebaseSignOut } from 'firebase/auth';
import { getAuthSafe } from '@/lib/firebase/clientApp';

const FIREBASE_NOT_CONFIGURED =
  'Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, and NEXT_PUBLIC_FIREBASE_PROJECT_ID to .env.local';

/**
 * Redirects to Google sign-in. After sign-in, Firebase redirects back to the current page
 * and AuthContext handles the result via getRedirectResult (no popup, avoids COOP errors).
 */
export async function signInWithGoogle() {
  const realAuth = getAuthSafe();
  if (!realAuth) {
    throw new Error(FIREBASE_NOT_CONFIGURED);
  }

  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');

  await signInWithRedirect(realAuth, provider);
  // Page will redirect; result is handled on return by getRedirectResult in AuthContext
}

export async function signOut() {
  const realAuth = getAuthSafe();
  if (!realAuth) return;
  return await firebaseSignOut(realAuth);
}
