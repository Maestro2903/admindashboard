import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local manually
const envPath = resolve(process.cwd(), '.env.local');
const envFile = readFileSync(envPath, 'utf-8');
for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    process.env[key] = val;
}

import admin from 'firebase-admin';

function normalizePrivateKey(raw) {
    let key = raw.trim().replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
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
    if (!key.endsWith('\n')) key = key + '\n';
    return key;
}

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
const projectId = (process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '').trim().replace(/\\n$/, '');

let credential;
if (serviceAccountKey) {
    credential = admin.credential.cert(JSON.parse(serviceAccountKey));
} else if (clientEmail && privateKey) {
    credential = admin.credential.cert({
        projectId,
        clientEmail: clientEmail.trim(),
        privateKey: normalizePrivateKey(privateKey),
    });
}

const app = admin.initializeApp({ credential, projectId });
const db = app.firestore();

await db.collection('events').doc('big-data-test').set({
    name: 'BIG DATA',
    category: 'technical',
    type: 'individual',
    date: '2026-02-28',
    venue: 'ILP Lab',
    startTime: '9:00 AM',
    endTime: '12:00 PM',
    prizePool: 0,
    allowedPassTypes: ['test_pass'],
    isActive: true,
    description: 'Test event for Cashfree sandbox testing.',
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
});

console.log('✅ BIG DATA test event created successfully!');
process.exit(0);
