# Payment Flow

This document describes how payments are handled **in this Admin Dashboard application**. Order creation and Cashfree webhook handling live in the **main registration application** (separate codebase); this app only reads payment data from Firestore and provides a "fix stuck payment" flow.

## Scope of This Application

- **Does not:** Create Cashfree orders, show payment UI to end users, or receive Cashfree webhooks.
- **Does:** Read payments and passes from Firestore, list them in the dashboard, and run **fix-stuck-payment** when a Cashfree order is PAID but the corresponding pass was never created (e.g. webhook failure or delay).

## Cashfree Usage in This Repo

Cashfree is used in:

- **Fix stuck payment:** `app/api/fix-stuck-payment/route.ts` (GET order status).
- **Create orders:** `app/api/admin/onspot/create-order/route.ts`, `app/api/admin/create-registration-order/route.ts`, `app/api/payment/create-order/route.ts` (POST /orders).

All order APIs use **x-api-version: 2025-01-01** and the base URL from `NEXT_PUBLIC_CASHFREE_ENV` (production → `https://api.cashfree.com/pg`, otherwise sandbox).

**Environment variables:**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_CASHFREE_ENV` | `"production"` or `"sandbox"`. Selects API base URL. |
| `CASHFREE_APP_ID` or `NEXT_PUBLIC_CASHFREE_APP_ID` | Cashfree app ID (x-client-id). |
| `CASHFREE_SECRET_KEY` | Cashfree secret (x-client-secret). Server-only. |

**API base URL:**

- Production: `https://api.cashfree.com/pg`
- Sandbox: `https://sandbox.cashfree.com/pg`

The route calls the Cashfree **Orders API** (`GET /orders/{order_id}`) with headers `x-client-id`, `x-client-secret`, `x-api-version: 2025-01-01` to fetch order status.

## Fix-Stuck-Payment Flow

1. **Request:** Organizer sends `POST /api/fix-stuck-payment` with body `{ orderId: string }`. Route requires **requireOrganizer** and applies a **rate limit of 3 requests per 60 seconds** (via `lib/security/rateLimiter.ts`).

2. **Cashfree check:** App calls Cashfree `GET /orders/{orderId}`. If the response is not OK (e.g. 4xx/5xx), returns **500** with error details. If `order.order_status !== 'PAID'`, returns **400** with `{ success: false, error: "Cannot fix: Payment status is ... (not PAID)", cashfreeStatus }`.

3. **Find payment:** App queries Firestore `payments` where `cashfreeOrderId == orderId`, limit 1. If no document found, returns **404** `{ error: "Payment record not found in database", orderId }`.

4. **Update payment if needed:** If the payment document’s `status !== 'success'`, the route updates it to `status: 'success'`, `updatedAt`, `fixedManually: true`.

5. **Pass already exists:** If a pass document already exists with `paymentId == orderId`, the route rebuilds `admin_dashboard` for that user (fire-and-forget), then returns **200** with `{ success: true, message: "Payment already processed (pass exists)", passId, qrCode }`.

6. **Create pass:** If no pass exists:
   - Creates a new pass document with: userId, passType, amount, paymentId (orderId), status `'paid'`, qrCode (from `createQRPayload` + QRCode.toDataURL in `features/passes/qrService.ts`), createdAt, createdManually.
   - For `passType === 'group_events'` and existing teamId: loads team doc, sets pass `teamId` and `teamSnapshot`, and updates team with `passId` and `paymentStatus: 'success'`.
   - Rebuilds `admin_dashboard` for the user (fire-and-forget).
   - If the user has an email: sends pass confirmation email via Resend (`features/email/emailService.ts`) with optional PDF attachment from `features/passes/pdfGenerator.server.ts`.
   - Returns **200** with `{ success: true, message: "Payment fixed successfully", passId, qrCode, details: { orderId, userId, passType, amount } }`.

7. **QR and email:** QR generation requires **QR_SECRET_KEY**. Email requires **RESEND_API_KEY**. If either is missing, those steps are skipped or fail gracefully (e.g. log and continue); the pass is still created and the API can still return success.

## Verification Logic

- **Source of truth for “paid”:** Cashfree’s `order_status === 'PAID'`. The app does not trust Firestore payment status alone for creating a new pass; it always confirms with the Cashfree Orders API first.
- After confirmation, the app aligns Firestore: payment record set to success (if it wasn’t), and pass record created if missing. So Firestore is brought in line with Cashfree for that order.

## Failure Cases and HTTP Status

| Case | HTTP | Response body |
|------|------|----------------|
| Missing or invalid `orderId` | 400 | `{ error: "Missing orderId" }` |
| Cashfree API error (network, 4xx/5xx) | 500 | `{ error: "Cashfree API error: ...", details }` |
| Order not PAID | 400 | `{ success: false, error: "Cannot fix: Payment status is ... (not PAID)", cashfreeStatus }` |
| No payment doc with that cashfreeOrderId | 404 | `{ error: "Payment record not found in database", orderId }` |
| Missing Cashfree config (appId/secret) | 500 | `{ error: "Payment not configured" }` |
| Unauthorized (no/invalid token or not organizer) | 401 / 403 | Standard auth error body |
| Rate limit exceeded | 429 | `{ error: "Too many requests. Please try again later." }` with Retry-After |
| Other server error (e.g. QR_SECRET_KEY missing during pass creation) | 500 | `{ error: "...", details? }` |

QR generation uses `QR_SECRET_KEY` in `features/passes/qrService.ts` (`createQRPayload`). If it is not set, pass creation can throw and the request returns 500. Resend/PDF failures are logged and do not change the HTTP status if the pass was already written.

## Troubleshooting: "transactions are not enabled for your payment gateway account"

When **creating an order** (on-spot, manual registration, or payment create-order), Cashfree may return **400** with `order_create_failed` and message "transactions are not enabled for your payment gateway account". Checklist:

1. **Confirm API version:** The app sends `x-api-version: 2025-01-01`. After a deploy, check server logs for `[OnSpotCreateOrder] Cashfree request` — it will show `xApiVersion` and `base` (sandbox vs production URL). If you see an old version, redeploy so the latest code is live.
2. **Credentials and environment:** Use **sandbox** App ID and Secret with sandbox base URL (do not set `NEXT_PUBLIC_CASHFREE_ENV=production`). Use **production** App ID and Secret only with production base URL (`NEXT_PUBLIC_CASHFREE_ENV=production`). Mismatched env and credentials can trigger this error.
3. **Cashfree Dashboard:** In [Cashfree Merchant Dashboard](https://merchant.cashfree.com/) → your app → ensure **Payment Gateway (PG)** / **Transactions** are enabled for that app. Some accounts have only "Payment Links" enabled; our flow uses the **Orders API** (PG), so the app must have PG/transactions enabled. For production, complete any required KYC/activation.
4. **Test with Sandbox:** Set `NEXT_PUBLIC_CASHFREE_ENV` to something other than `production` (or leave unset), use sandbox App ID and Secret, and create an order. If sandbox works and production does not, the production Cashfree app likely needs transactions enabled or activation in the dashboard.

The on-spot create-order API returns a `_debug` object in the error response when this error occurs, with `cashfreeBase` and `xApiVersion` so you can verify what the running deployment is using.

## Related Endpoints

- **POST /api/admin/passes/[passId]/fix-payment:** Same fix logic triggered by passId. Route reads the pass’s `paymentId` (orderId) and forwards to the fix-stuck-payment flow (internal POST to `/api/fix-stuck-payment` with that orderId). Requires organizer and mutation rate limit.
