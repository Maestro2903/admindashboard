# Switching to a New Firebase Project

The app uses **only environment variables** for Firebase. There are no hardcoded project IDs. To point the codebase at a new Firebase project (e.g. after rebuilding the database in a separate account):

1. **Update `.env.local`** (and production env if you use Vercel/etc.) with the new project’s values.

## 1. Client config (browser / sign-in)

In [Firebase Console](https://console.firebase.google.com) → your **new** project → **Project settings** (gear) → **General** → **Your apps** (Web app):

| Env variable | Where to copy from |
|--------------|--------------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` (e.g. `your-project.firebaseapp.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | `measurementId` (optional, for Analytics) |

## 2. Admin SDK (server / API routes)

In the **same** new project: **Project settings** → **Service accounts** → **Generate new private key**.

**Option A – JSON key (simplest for local):**

- Set `FIREBASE_SERVICE_ACCOUNT_KEY` to the **entire JSON** as a single line (e.g. minified).  
- No need to set `FIREBASE_PROJECT_ID`; it’s read from the JSON.

**Option B – Separate vars (e.g. for Vercel):**

- `FIREBASE_PROJECT_ID` = same as `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (or leave unset to use the public one).
- `FIREBASE_ADMIN_CLIENT_EMAIL` = from the service account JSON (`client_email`).
- `FIREBASE_ADMIN_PRIVATE_KEY` = from the JSON (`private_key`), including `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----`. In Vercel you can paste with `\n`; the code normalizes it.

## 3. After updating env

- Restart the Next.js dev server.
- Redeploy if you use a hosted environment.
- Re-run any scripts that use Firebase (e.g. `npm run admin:set-superadmin <email>`) so they use the new project (they read from `.env.local` / `.env`).

No code changes are required; only env values need to point to the new Firebase project.
