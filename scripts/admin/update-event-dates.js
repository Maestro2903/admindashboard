/**
 * Update events in Firestore with names and dates from the Group Events – Dates table.
 * Run from project root: node scripts/admin/update-event-dates.js [--dry-run]
 *
 * Matches events by name (case-insensitive, trimmed). Sets `date` (first day) and
 * for multi-day events sets `dates` array so day-pass filtering shows the event on all days.
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
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

const dryRun = process.argv.includes('--dry-run');

/** Event name (as in UI) -> { date: string, dates?: string[] } */
const EVENT_DATES = [
  { name: 'Battle of Bands', date: '27/02/26' },
  { name: 'Borderland Protocol (Borderland Arena)', date: '26/02/26' },
  { name: 'Case Files', dates: ['26/02/26', '27/02/26'] },
  { name: 'Choreo Showcase', date: '26/02/26' },
  { name: 'Duo Dance', date: '28/02/26' },
  { name: 'Exchange Effect', date: '26/02/26' },
  { name: 'Film Finatics', date: '26/02/26' },
  { name: 'Film Making (Workshop)', date: '27/02/26' },
  { name: 'Frame Spot', date: '26/02/26' },
  { name: 'Prompt Pixel', date: '27/02/26' },
  { name: 'Treasure Hunt', dates: ['26/02/26', '27/02/26', '28/02/26'] },
];

function normalizeName(s) {
  return (s || '').toLowerCase().trim();
}

function nameMatches(eventName, targetName) {
  const a = normalizeName(eventName);
  const b = normalizeName(targetName);
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return false;
}

async function main() {
  const eventsSnap = await db.collection('events').get();
  const events = eventsSnap.docs.map((d) => ({ id: d.id, ...d.data(), _ref: d.ref }));

  let updated = 0;
  let notFound = [];

  for (const row of EVENT_DATES) {
    const eventDoc = events.find((e) => nameMatches(e.name, row.name));
    if (!eventDoc) {
      notFound.push(row.name);
      continue;
    }

    const updates = { updatedAt: new Date() };
    if (row.dates && row.dates.length > 0) {
      updates.dates = row.dates;
      updates.date = row.dates[0];
    } else if (row.date) {
      updates.date = row.date;
      updates.dates = [row.date];
    }

    if (dryRun) {
      console.log(`[dry-run] Would update "${eventDoc.name}" (${eventDoc.id}):`, updates);
    } else {
      await eventDoc._ref.update(updates);
      console.log(`Updated "${eventDoc.name}" (${eventDoc.id}): date=${updates.date}, dates=${JSON.stringify(updates.dates)}`);
    }
    updated++;
  }

  if (notFound.length) {
    console.warn('Events not found (no name match):', notFound);
  }
  console.log(dryRun ? `[dry-run] Would update ${updated} events.` : `Done. Updated ${updated} events.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
