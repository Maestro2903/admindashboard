#!/usr/bin/env node
/**
 * Targeted Firestore JSON export for admin analysis.
 * Exports specific collections into separate files (max 30 docs each).
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const rootDir = path.resolve(__dirname, '..', '..');
  for (const name of ['.env.local', '.env']) {
    const envPath = path.join(rootDir, name);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach((rawLine) => {
        const line = rawLine.replace(/\r$/, '');
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
    console.error(
      'Missing Firebase Admin env. Set FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_PROJECT_ID + FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY.'
    );
    process.exit(1);
  }
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

const EXPORTS = [
  // Payments: add a computed `success` boolean from `status` (ex: paid -> true).
  { name: 'payments', filter: 'addSuccessFromStatus', orderBy: 'updatedAt' },
  { name: 'registrations' },
  { name: 'scans' },
  { name: 'teams', orderBy: 'updatedAt' },
  { name: 'test' },
];

function toJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function getArgValue(name) {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

function normalizePaymentDataForExport(raw, filter) {
  const data = toJsonSafe(raw);
  if (filter === 'addSuccessFromStatus') {
    const status = typeof data.status === 'string' ? data.status.toLowerCase() : undefined;
    const derivedSuccess = status === 'paid' || status === 'success' || status === 'succeeded';
    return { ...data, success: typeof data.success === 'boolean' ? data.success : derivedSuccess };
  }
  return data;
}

async function exportCollection({ name, filter, orderBy }) {
  console.log(`Exporting collection: ${name}`);

  let snap;
  try {
    let query = db.collection(name);
    if (orderBy) query = query.orderBy(orderBy, 'desc');
    query = query.limit(30);
    snap = await query.get();
  } catch (err) {
    // If Firestore complains about missing composite indexes, fall back to an unordered limit.
    let query = db.collection(name).limit(30);
    snap = await query.get();
  }
  const out = {};

  for (const doc of snap.docs) {
    out[doc.id] = normalizePaymentDataForExport(doc.data(), filter);
  }

  return { count: snap.size, data: out };
}

async function exportPaymentById(paymentId) {
  console.log(`Exporting payment doc: ${paymentId}`);
  const ref = db.collection('payments').doc(paymentId);
  const doc = await ref.get();
  if (!doc.exists) return { count: 0, data: {} };
  return {
    count: 1,
    data: { [doc.id]: normalizePaymentDataForExport(doc.data(), 'addSuccessFromStatus') },
  };
}

async function exportTeamById(teamId) {
  console.log(`Exporting team doc: ${teamId}`);
  const ref = db.collection('teams').doc(teamId);
  const doc = await ref.get();
  if (!doc.exists) return { count: 0, data: {} };
  return {
    count: 1,
    data: { [doc.id]: toJsonSafe(doc.data()) },
  };
}

async function exportSelected() {
  const outDir = path.resolve(__dirname, '..', '..', 'docs', 'firestore_exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const paymentsId = getArgValue('paymentsId') || getArgValue('paymentId') || getArgValue('payments-id');
  const teamsId = getArgValue('teamsId') || getArgValue('teamId') || getArgValue('teams-id');

  for (const spec of EXPORTS) {
    const { count, data } = await (async () => {
      if (spec.name === 'payments' && paymentsId) return exportPaymentById(paymentsId);
      if (spec.name === 'teams' && teamsId) return exportTeamById(teamsId);
      return exportCollection(spec);
    })();
    const outPath = path.join(outDir, `${spec.name}.json`);
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Wrote ${outPath} (${count} docs)`);
  }
}

exportSelected().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});

