#!/usr/bin/env node
/**
 * Uses Firebase Admin (same as app) to inspect Firestore: collections, counts, and sample docs.
 * Loads .env.local/.env for credentials. Run: node scripts/admin/db-inspect.js
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const rootDir = path.resolve(__dirname, '..', '..');
  for (const name of ['.env.local', '.env']) {
    const envPath = path.join(rootDir, name);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach((line) => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let val = match[2].trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
          if (!process.env[key]) process.env[key] = val.replace(/\\n/g, '\n');
        }
      });
    }
  }
}

loadEnv();

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (serviceAccountKey) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountKey)) });
} else {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing Firebase Admin env. Set FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_PROJECT_ID + FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY.');
    process.exit(1);
  }
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }),
  });
}

const db = admin.firestore();

const COLLECTIONS = ['users', 'payments', 'passes', 'teams', 'events', 'admin_dashboard', 'admin_logs'];

async function getCount(collName) {
  try {
    const snap = await db.collection(collName).limit(3000).get();
    return snap.size;
  } catch (e) {
    return { error: e.message };
  }
}

function sampleDoc(data, maxKeys = 12) {
  if (!data || typeof data !== 'object') return data;
  const keys = Object.keys(data).slice(0, maxKeys);
  const out = {};
  for (const k of keys) {
    const v = data[k];
    if (v && typeof v === 'object' && typeof v.toDate === 'function') {
      out[k] = '[Timestamp]';
    } else if (Array.isArray(v)) {
      out[k] = `[Array(${v.length})]`;
    } else if (typeof v === 'object' && v !== null) {
      out[k] = '[Object]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function main() {
  console.log('Firestore project:', db.projectId || '(from credentials)');
  console.log('');

  for (const collName of COLLECTIONS) {
    const count = await getCount(collName);
    const countStr = typeof count === 'number' ? count.toString() : `Error: ${count.error}`;
    console.log(`Collection: ${collName}  (doc count: ${countStr})`);

    if (typeof count === 'number' && count > 0) {
      const snap = await db.collection(collName).limit(2).get();
      snap.docs.forEach((doc, i) => {
        console.log(`  Sample doc ${i + 1} (id: ${doc.id}):`, JSON.stringify(sampleDoc(doc.data()), null, 2).split('\n').join('\n  '));
      });
    }
    console.log('');
  }

  // One pass and one payment sample for dashboard debugging
  console.log('--- Sample pass (for admin dashboard) ---');
  const passSnap = await db.collection('passes').orderBy('createdAt', 'desc').limit(1).get();
  if (!passSnap.empty) {
    const d = passSnap.docs[0].data();
    console.log('pass keys:', Object.keys(d).join(', '));
    console.log('userId:', d.userId);
    console.log('paymentId:', d.paymentId);
    console.log('passType:', d.passType);
    console.log('selectedEvents:', d.selectedEvents);
    console.log('createdAt:', d.createdAt);
  } else {
    console.log('No passes in DB.');
  }

  console.log('');
  console.log('--- Sample payment ---');
  const paySnap = await db.collection('payments').limit(1).get();
  if (!paySnap.empty) {
    const d = paySnap.docs[0].data();
    console.log('payment keys:', Object.keys(d).join(', '));
    console.log('status:', d.status);
    console.log('amount:', d.amount);
  } else {
    console.log('No payments in DB.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
