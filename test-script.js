const admin = require('firebase-admin');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const credential = admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
});

if (!admin.apps.length) {
    admin.initializeApp({ credential });
}

const db = admin.firestore();

async function run() {
    const passesSnap = await db.collection('passes')
        .where('passType', '==', 'group_events')
        .limit(1)
        .get();

    if (passesSnap.empty) {
        console.log('No group events found');
        return;
    }

    console.log(passesSnap.docs[0].data());
}

run();
