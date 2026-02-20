import { type FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAnalytics, type Analytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === 'undefined') return null;
  if (!firebaseConfig.apiKey) return null;

  if (getApps().length > 0) return getApp();
  return initializeApp(firebaseConfig);
}

const app = getFirebaseApp();

export const auth = app ? getAuth(app) : ({} as Auth);
export const db = app ? getFirestore(app) : ({} as Firestore);

// Initialize Analytics only in browser environment
let analytics: Analytics | null = null;
if (typeof window !== 'undefined' && app) {
  try {
    analytics = getAnalytics(app);
  } catch (error) {
    // Analytics initialization failed (e.g., in development or if measurementId is missing)
    console.warn('Firebase Analytics initialization failed:', error);
  }
}

export function getAuthSafe(): Auth | null {
  return app ? auth : null;
}

export function getDbSafe(): Firestore | null {
  return app ? db : null;
}

export function getAnalyticsSafe(): Analytics | null {
  return analytics;
}

export function getDb(): Firestore {
  if (!db || !app) {
    throw new Error('Firebase Firestore not initialized. Check your environment variables.');
  }
  return db;
}
