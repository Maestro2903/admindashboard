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

async function setSuperadmin(email) {
  try {
    console.log(`Looking for user with email: ${email}`);
    
    // Find user by email
    const usersSnapshot = await db.collection('users').where('email', '==', email).limit(1).get();
    
    if (usersSnapshot.empty) {
      console.error(`❌ User with email ${email} not found`);
      process.exit(1);
    }
    
    const userDoc = usersSnapshot.docs[0];
    const userId = userDoc.id;
    const userData = userDoc.data();
    
    console.log(`Found user: ${userData.name || 'Unknown'} (${userId})`);
    console.log(`Current adminRole: ${userData.adminRole || 'not set'}`);
    console.log(`Current isOrganizer: ${userData.isOrganizer || false}`);
    
    // Update adminRole to superadmin and ensure isOrganizer is true
    await db.collection('users').doc(userId).update({
      adminRole: 'superadmin',
      isOrganizer: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`✅ Successfully set adminRole to 'superadmin' for ${email}`);
    console.log(`✅ User ${userId} is now a superadmin`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error setting superadmin:', error);
    process.exit(1);
  }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/admin/set-superadmin.js <email>');
  console.error('Example: node scripts/admin/set-superadmin.js shreeshanthr06@gmail.com');
  process.exit(1);
}

setSuperadmin(email);
