# Deployment

This document covers build, environment setup, Firebase, hosting, and a production checklist for the Admin Dashboard.

## Build

- **Command:** `npm run build`  
  Runs the Next.js 16 production build.

- **Start (self-hosted):** `npm run start`  
  Starts the production server. The project is configured to use **port 3001** (`next start -p 3001` in package.json). On a platform that sets PORT (e.g. Vercel), the platform may override the port.

## Environment Setup

All variables used by the app are listed in `.env.example`. For production:

1. **Required for core app (sign-in + API):**
   - **Firebase client:** `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. Optional: storage, messaging, appId, measurementId.
   - **Firebase Admin:** Either `FIREBASE_SERVICE_ACCOUNT_KEY` (full JSON) or `FIREBASE_ADMIN_CLIENT_EMAIL` + `FIREBASE_ADMIN_PRIVATE_KEY`, and optionally `FIREBASE_PROJECT_ID`.

2. **Recommended for production:**
   - **APP_URL** — This app’s canonical URL (e.g. `https://tk26admin.vercel.app`). Used when calling back to the same app (e.g. fix-payment proxy). No trailing slash.
   - **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN** — Distributed rate limiting. If unset, rate limiting degrades gracefully (no Redis); in production you should set these.

3. **Optional (feature-specific):**
   - **NEXT_PUBLIC_MAIN_SITE_URL** — Link to main site (e.g. “Back to site”). Defaults to takshashila26.in in code if unset.
   - **QR_SECRET_KEY** — Required for generating signed QR payloads when creating a pass in fix-stuck-payment. If missing, pass creation can fail with 500.
   - **RESEND_API_KEY** — Sending pass confirmation email (and PDF) after fix-stuck-payment. If missing, email is skipped (logged).
   - **NEXT_PUBLIC_CASHFREE_ENV**, **CASHFREE_APP_ID** / **NEXT_PUBLIC_CASHFREE_APP_ID**, **CASHFREE_SECRET_KEY** — Required only if you use the fix-stuck-payment feature.

Do not deploy with empty or placeholder values for required vars; the app will fail at runtime (e.g. Firebase init or token verification).

## Firebase

- **Project:** The app uses only environment variables for Firebase; there are no hardcoded project IDs. To point at a different Firebase project, update env vars and restart/redeploy. See **[FIREBASE_SWITCH.md](FIREBASE_SWITCH.md)** for step-by-step client and Admin SDK setup.

- **Firestore indexes:** Some queries require composite indexes. Indexes are defined in **firestore.indexes.json** at the project root (e.g. passes by passType+createdAt, status+createdAt; payments by status+createdAt). If you use Firebase CLI for this project:
  ```bash
  firebase deploy --only firestore:indexes
  ```
  If a query fails with an index error, the API may return a message instructing you to deploy indexes.

- **Auth authorized domains:** In Firebase Console → Authentication → Settings → Authorized domains, add your dashboard domain (e.g. tk26admin.vercel.app) so Google sign-in works.

## Hosting

The app is designed to run on **Vercel**. Build command: `npm run build`. Output is the default Next.js output. Root directory is the repo root.

- **Environment variables on Vercel:** Set all required and optional vars in Vercel → Project → Settings → Environment Variables (Production and Preview). See **[VERCEL_ENV.md](VERCEL_ENV.md)** for syncing from `.env.local` with `npm run vercel:env-push` and for APP_URL guidance.

- **APP_URL:** Set to your production URL (e.g. `https://tk26admin.vercel.app`) for Production and Preview so server-side callbacks (e.g. fix-payment) use the correct origin.

## Production Checklist

Before going live, confirm:

- [ ] **Environment variables** — All required Firebase (client + admin) and APP_URL set. No empty/placeholder values for required vars.
- [ ] **Firebase Admin credentials** — Valid service account or client email + private key; project ID correct. Token verification and Firestore access work.
- [ ] **Upstash Redis** — UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN set so distributed rate limiting is active.
- [ ] **Firestore indexes** — Deployed (`firebase deploy --only firestore:indexes` if using Firebase CLI) so dashboard and pass queries do not fail with index errors.
- [ ] **Firebase Auth authorized domains** — Dashboard domain added so Google sign-in is allowed.
- [ ] **RESEND** — If you use fix-stuck-payment and want email: RESEND_API_KEY set and sending domain verified in Resend.
- [ ] **Cashfree** — If you use fix-stuck-payment: NEXT_PUBLIC_CASHFREE_ENV, CASHFREE_APP_ID (or NEXT_PUBLIC_CASHFREE_APP_ID), and CASHFREE_SECRET_KEY set; use production env and keys for live payments.
- [ ] **QR_SECRET_KEY** — Set if fix-stuck-payment should create passes with signed QR payloads; otherwise pass creation can fail.

After deployment, test sign-in, a few dashboard reads, and (if applicable) fix-stuck-payment and scan-verify.
