import admin from 'firebase-admin';
import 'dotenv/config';

const projectId = process.env.FIREBASE_PROJECT_ID || "cit-takshashila-2026-3fd85";
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!admin.apps.length) {
    if (clientEmail && privateKey) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail,
                privateKey,
            }),
            projectId: projectId,
        });
    } else {
        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            projectId: projectId,
        });
    }
}

const db = admin.firestore();

async function createTestRegistration() {
    const timestamp = Date.now();
    const testId = `test_reg_${timestamp}`;

    const testRecord = {
        name: "Test User (₹1 Updated)",
        email: `test_user_${timestamp}@example.com`,
        phone: "9999999901",
        college: "Testing Institute",
        passType: "testing",
        status: "pending",
        calculatedAmount: 1,
        amount: 1,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        selectedEvents: ["testing-flow-v3"],
        userId: `test_uid_${timestamp}`
    };

    console.log('Creating test record:', testId);
    await db.collection('registrations').doc(testId).set(testRecord);
    console.log('Successfully created ₹1 test record.');
    console.log('Registration ID:', testId);
}

createTestRegistration().catch(console.error);
