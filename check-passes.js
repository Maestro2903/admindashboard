const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

async function checkPasses() {
  console.log('Checking passes collection...\n');
  
  const passesSnap = await db.collection('passes').limit(10).get();
  console.log(`Total passes found: ${passesSnap.size}`);
  
  if (passesSnap.empty) {
    console.log('No passes found in Firestore!');
    return;
  }
  
  passesSnap.forEach(doc => {
    const data = doc.data();
    console.log(`\nPass ID: ${doc.id}`);
    console.log(`  passType: ${data.passType}`);
    console.log(`  isArchived: ${data.isArchived}`);
    console.log(`  paymentId: ${data.paymentId}`);
    console.log(`  userId: ${data.userId}`);
  });
  
  // Check day_pass specifically
  const dayPassSnap = await db.collection('passes')
    .where('passType', '==', 'day_pass')
    .where('isArchived', '==', false)
    .limit(5)
    .get();
  
  console.log(`\n\nDay passes (not archived): ${dayPassSnap.size}`);
}

checkPasses().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
