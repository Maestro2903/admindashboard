import * as admin from 'firebase-admin';

function normalizePrivateKey(raw: string): string {
  if (!raw) return '';
  let key = raw.trim();
  // Replace escaped newlines with actual newlines
  key = key.replace(/\\n/g, '\n');
  // Normalize line endings
  key = key.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  key = key.trim();
  
  // If the key doesn't have proper line breaks but contains BEGIN/END markers,
  // reformat it with proper line breaks
  if (!key.includes('\n') && key.includes('-----BEGIN') && key.includes('-----END')) {
    const begin = '-----BEGIN PRIVATE KEY-----';
    const end = '-----END PRIVATE KEY-----';
    const start = key.indexOf(begin);
    const endStart = key.indexOf(end);
    if (start !== -1 && endStart > start) {
      const middle = key.slice(start + begin.length, endStart).replace(/\s/g, '');
      const lines = middle.match(/.{1,64}/g) || [];
      key = begin + '\n' + lines.join('\n') + '\n' + end;
    }
  }
  
  // Ensure proper formatting
  if (!key.endsWith('\n')) {
    key = key + '\n';
  }
  
  return key;
}

function getAdminApp() {
  if (admin.apps.length > 0) return admin.app();

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  let credential;

  if (serviceAccountKey) {
    credential = admin.credential.cert(JSON.parse(serviceAccountKey) as admin.ServiceAccount);
  } else if (clientEmail && privateKey) {
    const normalizedKey = normalizePrivateKey(privateKey);
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new Error('Firebase project ID is missing. Set FIREBASE_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID.');
    }
    credential = admin.credential.cert({
      projectId: projectId,
      clientEmail: clientEmail.trim(),
      privateKey: normalizedKey,
    });
  } else {
    throw new Error(
      'Firebase Admin credentials missing. Provide either FIREBASE_SERVICE_ACCOUNT_KEY or both FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY.'
    );
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  return admin.initializeApp({
    credential,
    projectId: projectId || undefined,
  });
}

export function getAdminAuth() {
  return getAdminApp().auth();
}

export function getAdminFirestore() {
  return getAdminApp().firestore();
}
