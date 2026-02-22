# Admin Dashboard — Technical Documentation

This folder contains production-grade technical documentation for the CIT Takshashila Admin Dashboard.

## Project Purpose

The Admin Dashboard is an **operations control panel** for the CIT Takshashila event. Organizers use it to:

- Manage passes, payments, teams, and events
- Perform live check-in via QR code scan
- View financial and operations dashboards (with role-based visibility)
- Fix stuck payments (reconcile Cashfree PAID orders that never created a pass)

Data lives in **Firebase** (Authentication + Firestore). Payment processing is done by **Cashfree**; order creation and webhook handling occur in the **main registration application**, not in this repository. This app reads payment and pass data from Firestore and provides read/manage/fix flows.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js **16.1.6** (App Router), React 19, TypeScript 5 |
| Styling | Tailwind CSS 4, `globals.css` + `admin.css`, dark theme |
| Auth & DB | Firebase (client SDK: Auth, Firestore, Analytics; server: Admin SDK) |
| Payments | Cashfree (used here only for fix-stuck-payment via Orders API; no webhook in this repo) |
| Email | Resend (`features/email/emailService.ts`) |
| Rate limiting | Upstash Redis + `@upstash/ratelimit` (Edge middleware + route-level `lib/security/adminRateLimiter.ts`) |
| UI | `@tanstack/react-table`, recharts, jspdf, qrcode, sonner, radix-ui/vaul |

Key paths:

- **Firebase client:** `lib/firebase/clientApp.ts`
- **Firebase Admin:** `lib/firebase/adminApp.ts`
- **Auth:** `features/auth/authService.ts`, `features/auth/AuthContext.tsx`
- **Admin guards:** `lib/admin/requireOrganizer.ts`, `lib/admin/requireAdminRole.ts`

## Setup

1. **Clone and install**
   ```bash
   npm install
   ```

2. **Environment**
   - Copy `.env.example` to `.env.local`
   - Fill at least: Firebase (client + admin). See [Environment variables](#environment-variables) and [DEPLOYMENT.md](DEPLOYMENT.md).

3. **Run**
   ```bash
   npm run dev
   ```
   App runs on **port 3001** (`http://localhost:3001`).

4. **Organizer access**
   - Sign in with Google (Firebase Auth).
   - Your user document in Firestore `users/{uid}` must have `isOrganizer: true`. Use `npm run admin:set-superadmin <email>` (or manual Firestore update) to grant organizer and optionally admin role.

## Environment Variables

All variables are defined in `.env.example`. Summary:

| Variable | Required | Description |
|----------|----------|-------------|
| **Firebase (client)** | Yes (for sign-in) | `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, plus optional storage, messaging, appId, measurementId |
| **Firebase Admin** | Yes (for API) | Either `FIREBASE_SERVICE_ACCOUNT_KEY` (full JSON) or `FIREBASE_ADMIN_CLIENT_EMAIL` + `FIREBASE_ADMIN_PRIVATE_KEY`; `FIREBASE_PROJECT_ID` if not using service account JSON |
| **APP_URL** | Recommended (production) | This app’s URL (e.g. `https://tk26admin.vercel.app`). Used for fix-payment callback base URL. |
| **NEXT_PUBLIC_MAIN_SITE_URL** | Optional | Main site link (e.g. `https://takshashila26.in`) for “Back to site”. |
| **UPSTASH_REDIS_REST_URL** / **UPSTASH_REDIS_REST_TOKEN** | Recommended (production) | Distributed rate limiting; if unset, rate limiting degrades gracefully (no Redis). |
| **QR_SECRET_KEY** | For fix-stuck-payment | Used to generate signed QR payloads when creating a pass in fix-stuck-payment. |
| **RESEND_API_KEY** | For fix-stuck-payment email | Sending pass confirmation email (and PDF) after fix-stuck-payment. |
| **NEXT_PUBLIC_CASHFREE_ENV** | For fix-stuck-payment | `production` or `sandbox`. |
| **CASHFREE_APP_ID** / **NEXT_PUBLIC_CASHFREE_APP_ID** | For fix-stuck-payment | Cashfree app ID. |
| **CASHFREE_SECRET_KEY** | For fix-stuck-payment | Cashfree secret (server-only). |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server on port 3001 |
| `npm run build` | Next.js production build |
| `npm run start` | Start production server (port 3001) |
| `npm run admin:backfill-dashboard` | Backfill `admin_dashboard` collection from users/payments/passes/teams |
| `npm run admin:set-superadmin` | Set a user as organizer/superadmin by email (reads Firestore) |
| `npm run vercel:env-push` | Push `.env.local` vars to Vercel (see [VERCEL_ENV.md](VERCEL_ENV.md)) |

## Documentation Index

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, frontend/backend architecture, auth, data flow |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | Firestore collections, document structure, indexes |
| [API_REFERENCE.md](API_REFERENCE.md) | All API routes, methods, request/response, auth and rate limits |
| [AUTH_AND_ROLES.md](AUTH_AND_ROLES.md) | Authentication, organizer check, admin roles, capabilities |
| [PAYMENT_FLOW.md](PAYMENT_FLOW.md) | Cashfree usage in this app, fix-stuck-payment flow |
| [ADMIN_DASHBOARD.md](ADMIN_DASHBOARD.md) | Dashboard views, filtering, pagination, data visibility |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Build, environment, Firebase, hosting, production checklist |
| [FIREBASE_SWITCH.md](FIREBASE_SWITCH.md) | Switching to a new Firebase project (env-only) |
| [VERCEL_ENV.md](VERCEL_ENV.md) | Vercel environment variables and APP_URL |

## Deployment

For build, environment, Firebase, and hosting details see **[DEPLOYMENT.md](DEPLOYMENT.md)**. For syncing env to Vercel see **[VERCEL_ENV.md](VERCEL_ENV.md)**.
