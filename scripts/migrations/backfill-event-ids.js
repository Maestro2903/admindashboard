/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Backfill eventIds, eventCategory, eventType on passes, payments, and teams.
 * Run after deploying the event-based schema. Use --dry-run to preview.
 *
 * Usage:
 *   node scripts/migrations/backfill-event-ids.js [--dry-run] [--passes-only] [--payments-only] [--teams-only]
 *   BATCH_SIZE=200 node scripts/migrations/backfill-event-ids.js
 *
 * After this script, run scripts/admin/backfill-admin-dashboard.js to rebuild admin_dashboard with new filter arrays.
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
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    }),
  });
}

const db = admin.firestore();

const dryRun = process.argv.includes('--dry-run');
const passesOnly = process.argv.includes('--passes-only');
const paymentsOnly = process.argv.includes('--payments-only');
const teamsOnly = process.argv.includes('--teams-only');
const BATCH_SIZE = Math.min(Math.max(parseInt(process.env.BATCH_SIZE || '500', 10), 1), 500);

function getString(d, key) {
  const v = d[key];
  return typeof v === 'string' ? v : undefined;
}

function getStringArray(d, key) {
  const v = d[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string');
}

function getEventIdsFromPass(d) {
  const eventIds = getStringArray(d, 'eventIds');
  if (eventIds.length > 0) return eventIds;
  const selected = getStringArray(d, 'selectedEvents');
  const single = getString(d, 'eventId') || getString(d, 'selectedEvent');
  if (single && !selected.includes(single)) return [...selected, single];
  return selected;
}

async function buildPassTypeToEventIdsMap() {
  const eventsSnap = await db.collection('events').get();
  const map = {};
  eventsSnap.docs.forEach((doc) => {
    const d = doc.data();
    const allowed = Array.isArray(d.allowedPassTypes) ? d.allowedPassTypes.filter((x) => typeof x === 'string') : [];
    allowed.forEach((passType) => {
      if (!map[passType]) map[passType] = [];
      if (!map[passType].includes(doc.id)) map[passType].push(doc.id);
    });
  });
  return map;
}

async function backfillPasses(passTypeToEventIds, eventsById) {
  console.log('Backfilling passes (eventIds, eventCategory, eventType)...');
  const snap = await db.collection('passes').get();
  const toUpdate = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const existingIds = getStringArray(d, 'eventIds');
    if (existingIds.length > 0) continue; // already has eventIds
    const eventIds = getEventIdsFromPass(d);
    const resolved = eventIds.length > 0 ? eventIds : (passTypeToEventIds[d.passType] || []);
    if (resolved.length === 0) continue;
    const firstEvent = eventsById.get(resolved[0]);
    const updates = {
      eventIds: resolved,
      selectedEvents: resolved,
    };
    if (firstEvent?.category) updates.eventCategory = firstEvent.category;
    if (firstEvent?.type) updates.eventType = firstEvent.type;
    toUpdate.push({ id: doc.id, ref: doc.ref, updates });
  }
  console.log(`  Passes to update: ${toUpdate.length}`);
  if (dryRun) {
    console.log('  [DRY RUN] Skipping writes.');
    return toUpdate.length;
  }
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = db.batch();
    toUpdate.slice(i, i + BATCH_SIZE).forEach(({ ref, updates }) => {
      batch.update(ref, updates);
    });
    await batch.commit();
    console.log(`  Committed ${Math.min(i + BATCH_SIZE, toUpdate.length)} / ${toUpdate.length}`);
  }
  return toUpdate.length;
}

async function backfillPayments(passesByPaymentId) {
  console.log('Backfilling payments (eventIds)...');
  const snap = await db.collection('payments').get();
  const toUpdate = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const existingIds = getStringArray(d, 'eventIds');
    if (existingIds.length > 0) continue;
    const pass = passesByPaymentId.get(doc.id) || passesByPaymentId.get(d.cashfreeOrderId);
    if (!pass) continue;
    const eventIds = getEventIdsFromPass(pass);
    if (eventIds.length === 0) continue;
    toUpdate.push({ ref: doc.ref, updates: { eventIds } });
  }
  console.log(`  Payments to update: ${toUpdate.length}`);
  if (dryRun) {
    console.log('  [DRY RUN] Skipping writes.');
    return toUpdate.length;
  }
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = db.batch();
    toUpdate.slice(i, i + BATCH_SIZE).forEach(({ ref, updates }) => batch.update(ref, updates));
    await batch.commit();
    console.log(`  Committed ${Math.min(i + BATCH_SIZE, toUpdate.length)} / ${toUpdate.length}`);
  }
  return toUpdate.length;
}

async function backfillTeams(passesById) {
  console.log('Backfilling teams (eventIds)...');
  const snap = await db.collection('teams').get();
  const toUpdate = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    if (!d.passId) continue;
    const existingIds = getStringArray(d, 'eventIds');
    if (existingIds.length > 0) continue;
    const pass = passesById.get(d.passId);
    if (!pass) continue;
    const eventIds = getEventIdsFromPass(pass);
    if (eventIds.length === 0) continue;
    toUpdate.push({ ref: doc.ref, updates: { eventIds } });
  }
  console.log(`  Teams to update: ${toUpdate.length}`);
  if (dryRun) {
    console.log('  [DRY RUN] Skipping writes.');
    return toUpdate.length;
  }
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = db.batch();
    toUpdate.slice(i, i + BATCH_SIZE).forEach(({ ref, updates }) => batch.update(ref, updates));
    await batch.commit();
    console.log(`  Committed ${Math.min(i + BATCH_SIZE, toUpdate.length)} / ${toUpdate.length}`);
  }
  return toUpdate.length;
}

async function main() {
  if (dryRun) console.log('--- DRY RUN (no writes) ---\n');

  const eventsSnap = await db.collection('events').get();
  const eventsById = new Map();
  eventsSnap.docs.forEach((doc) => {
    const d = doc.data();
    eventsById.set(doc.id, { id: doc.id, category: d.category, type: d.type });
  });

  const passTypeToEventIds = await buildPassTypeToEventIdsMap();
  console.log('PassType -> eventIds map:', Object.keys(passTypeToEventIds).length, 'pass types\n');

  let passesUpdated = 0;
  let paymentsUpdated = 0;
  let teamsUpdated = 0;

  if (!paymentsOnly && !teamsOnly) {
    passesUpdated = await backfillPasses(passTypeToEventIds, eventsById);
  }

  // Build paymentId/cashfreeOrderId -> pass data for payments backfill
  const passesSnap = await db.collection('passes').get();
  const passesById = new Map();
  const passesByPaymentId = new Map();
  passesSnap.docs.forEach((doc) => {
    const d = doc.data();
    passesById.set(doc.id, d);
    const paymentId = d.paymentId;
    if (paymentId) passesByPaymentId.set(paymentId, d);
    if (d.paymentId && d.paymentId !== doc.id) passesByPaymentId.set(d.paymentId, d);
  });

  if (!passesOnly && !teamsOnly) {
    paymentsUpdated = await backfillPayments(passesByPaymentId);
  }

  if (!passesOnly && !paymentsOnly) {
    teamsUpdated = await backfillTeams(passesById);
  }

  console.log('\n--- Summary ---');
  console.log('Passes updated:', passesUpdated);
  console.log('Payments updated:', paymentsUpdated);
  console.log('Teams updated:', teamsUpdated);
  if (dryRun) console.log('\nRun without --dry-run to apply changes.');
  console.log('Then run: node scripts/admin/backfill-admin-dashboard.js to rebuild admin_dashboard.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
