/* eslint-disable @typescript-eslint/no-require-imports */
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
          let key = match[1].trim();
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

async function rebuildForUser(userId) {
  try {
    const [userSnap, paymentsSnap, passesSnap, teamsSnap] = await Promise.all([
      db.collection('users').doc(userId).get(),
      db.collection('payments').where('userId', '==', userId).get(),
      db.collection('passes').where('userId', '==', userId).get(),
      db.collection('teams').where('leaderId', '==', userId).get(),
    ]);

    const userData = userSnap.exists ? userSnap.data() : null;
    const profile = {
      name: userData?.name ?? '',
      email: userData?.email ?? '',
      phone: userData?.phone ?? '',
      college: userData?.college ?? '',
      isOrganizer: userData?.isOrganizer ?? false,
      createdAt: userData?.createdAt ?? null,
    };

    const payments = paymentsSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        paymentId: doc.id,
        amount: Number(d.amount) ?? 0,
        passType: String(d.passType ?? ''),
        status: d.status === 'success' || d.status === 'failed' ? d.status : 'pending',
        createdAt: d.createdAt ?? null,
      };
    });

    const passes = passesSnap.docs.map((doc) => {
      const d = doc.data();
      const usedAt = d.usedAt ?? null;
      const p = {
        passId: doc.id,
        passType: String(d.passType ?? ''),
        status: usedAt ? 'used' : 'paid',
        amount: Number(d.amount) ?? 0,
        createdAt: d.createdAt ?? null,
      };
      if (usedAt) p.usedAt = usedAt;
      if (d.teamId) p.teamId = d.teamId;
      return p;
    });

    const teams = teamsSnap.docs.map((doc) => {
      const d = doc.data();
      const t = {
        teamId: doc.id,
        teamName: String(d.teamName ?? ''),
        totalMembers: Number(d.totalMembers ?? d.members?.length ?? 0),
        paymentStatus: String(d.paymentStatus ?? 'pending'),
      };
      if (d.passId) t.passId = d.passId;
      return t;
    });

    const totalAmountPaid = payments.filter((p) => p.status === 'success').reduce((sum, p) => sum + p.amount, 0);
    const filterPassTypes = [...new Set(passes.map((p) => p.passType).filter(Boolean))];
    const filterPaymentStatuses = [...new Set(payments.map((p) => p.status).filter(Boolean))];

    const docData = {
      userId,
      profile,
      payments,
      passes,
      teams,
      summary: {
        totalPayments: payments.length,
        totalAmountPaid,
        totalPasses: passes.length,
        totalTeams: teams.length,
      },
      filterPassTypes,
      filterPaymentStatuses,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('admin_dashboard').doc(userId).set(docData);
    return { ok: true, userId };
  } catch (err) {
    console.error(`  Error for ${userId}:`, err.message);
    return { ok: false, userId, error: err.message };
  }
}

async function backfill() {
  console.log('Collecting distinct user IDs...');
  const userIds = new Set();

  const [usersSnap, paymentsSnap, passesSnap, teamsSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('payments').get(),
    db.collection('passes').get(),
    db.collection('teams').get(),
  ]);

  usersSnap.docs.forEach((d) => userIds.add(d.id));
  paymentsSnap.docs.forEach((d) => userIds.add(d.data().userId));
  passesSnap.docs.forEach((d) => userIds.add(d.data().userId));
  teamsSnap.docs.forEach((d) => userIds.add(d.data().leaderId));

  const list = [...userIds].filter(Boolean);
  console.log(`Found ${list.length} distinct user IDs to process.`);

  if (list.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  const BATCH_SIZE = 10;
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const batch = list.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((uid) => rebuildForUser(uid)));
    results.forEach((r) => (r.ok ? ok++ : fail++));
    console.log(`Processed ${Math.min(i + BATCH_SIZE, list.length)} / ${list.length}`);
  }

  console.log(`\nDone. Success: ${ok}, Failed: ${fail}`);
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
