# Cashfree Webhook Database Analysis

## Database Collections Overview

### Core Collections

1. **`registrations`** - Registration requests (pending → converted → cancelled)
2. **`onspotPayments`** - Payment records created via admin dashboard on-spot flow
3. **`payments`** - Payment records (legacy/main app)
4. **`passes`** - Issued passes (created after successful payment)
5. **`users`** - User profiles
6. **`teams`** - Team data for group events
7. **`events`** - Event metadata
8. **`admin_dashboard`** - Aggregated read-optimized docs per user
9. **`admin_logs`** - Audit logs

---

## Registration Collection Structure

**Document ID**: Auto-generated or custom (e.g., `admin_{registrationId}_{timestamp}`)

### Fields:
- `userId` (string) - User ID
- `name` (string) - User name
- `email` (string) - User email
- `phone` (string) - User phone
- `college` (string) - College name
- `passType` (string) - day_pass, group_events, proshow, sana_concert
- `status` (string) - 'pending' | 'converted' | 'cancelled'
- `calculatedAmount` (number) - Calculated amount
- `amount` (number) - Amount
- `selectedDays` (string[]) - Selected days (for day_pass)
- `selectedEvents` (string[]) - Selected event IDs
- `createdAt` (Timestamp) - Creation time
- `updatedAt` (Timestamp) - Last update
- `statusUpdatedAt` (Timestamp) - When status was last updated
- `statusUpdatedBy` (string) - UID of admin who updated status

### Indexes:
- `userId` ASC + `status` ASC + `createdAt` DESC
- `status` ASC + `createdAt` DESC
- `passType` ASC + `status` ASC + `createdAt` DESC

---

## OnspotPayments Collection Structure

**Document ID**: Cashfree order ID (e.g., `admin_{registrationId}_{timestamp}`)

### Fields:
- `registrationId` (string) - **KEY FIELD** - Links to registrations collection
- `userId` (string) - User ID
- `amount` (number) - Payment amount
- `passType` (string) - Pass type
- `status` (string) - 'pending' | 'success' | 'failed'
- `cashfreeOrderId` (string) - Cashfree order ID (same as document ID)
- `createdAt` (Timestamp) - Creation time
- `updatedAt` (Timestamp) - Last update
- `notes` (string) - Admin notes
- `source` (string) - 'admin-dashboard-onspot'

### Purpose:
Created when admin creates a Cashfree order via `/api/payment/create-order` for an existing registration.

---

## Payments Collection Structure

**Document ID**: Auto-generated (often same as Cashfree order ID)

### Fields:
- `userId` (string) - User ID
- `amount` (number) - Payment amount
- `passType` (string) - Pass type
- `status` (string) - 'pending' | 'success' | 'failed'
- `cashfreeOrderId` (string) - Cashfree order ID
- `orderId` (string) - Same as cashfreeOrderId
- `registrationId` (string) - **MAY EXIST** - Links to registrations (optional)
- `createdAt` (Timestamp) - Creation time
- `updatedAt` (Timestamp) - Last update
- `teamId` (string) - For group events
- `eventIds` (string[]) - Event IDs
- `isManualRegistration` (boolean) - Created via manual registration
- `registeredByAdmin` (string) - Admin UID

### Purpose:
Legacy payment records from main app or manual registrations.

---

## Webhook Flow Analysis

### Current Flow:

```
1. Admin creates Cashfree order
   ├─ Via /api/payment/create-order
   ├─ Creates onspotPayments doc with:
   │  ├─ Document ID = cashfreeOrderId (admin_{registrationId}_{timestamp})
   │  └─ registrationId field = registration document ID
   └─ OR creates payments doc (manual registration)

2. User pays via Cashfree

3. Cashfree sends webhook
   ├─ Event: PAYMENT_SUCCESS_WEBHOOK
   ├─ Data: { order: { order_id, order_status: "PAID" } }
   └─ Headers: x-webhook-signature, x-webhook-timestamp

4. Webhook processes (async):
   ├─ Verifies signature ✓
   ├─ Checks event type and order status ✓
   ├─ Finds registrationId:
   │  ├─ Strategy 1: onspotPayments.doc(orderId).registrationId
   │  ├─ Strategy 2: payments.where('cashfreeOrderId', orderId).registrationId
   │  ├─ Strategy 3: Extract from orderId format (admin_*)
   │  └─ Strategy 4: Direct lookup registrations.doc(orderId)
   ├─ Updates registration.status = "converted" ✓
   └─ Returns 200 immediately ✓

5. Expected downstream flow (NOT IMPLEMENTED):
   ├─ Firestore trigger on registrations.status change
   ├─ Moves data: registrations → payments
   ├─ Creates pass: payments → passes
   └─ Updates admin_dashboard
```

---

## Key Relationships

### Registration → Payment Mapping:

1. **OnspotPayments Flow**:
   ```
   registrations/{registrationId}
   └─ onspotPayments/{cashfreeOrderId}
      └─ registrationId field → links back to registration
   ```

2. **Payments Flow**:
   ```
   registrations/{registrationId}
   └─ payments/{paymentId}
      └─ cashfreeOrderId = orderId
      └─ registrationId field (may exist)
   ```

3. **Order ID Format**:
   ```
   admin_{registrationId}_{timestamp}
   └─ Can extract registrationId from format
   ```

### Payment → Pass Flow:

```
payments/{paymentId}
└─ passes/{passId}
   └─ paymentId field = payment document ID or Cashfree order ID
```

---

## Webhook Implementation Status

### ✅ Implemented:
- Signature verification
- Event type detection (PAYMENT_SUCCESS_WEBHOOK)
- Order status check (PAID)
- Registration lookup (4 strategies)
- Idempotency checks
- Async processing (returns 200 immediately)
- Error handling

### ❌ Missing:
- **Firestore trigger** to handle registration.status → payment → pass flow
- Automatic payment document creation when registration becomes "converted"
- Automatic pass creation when payment becomes "success"

### Current Workaround:
- `/api/fix-stuck-payment` endpoint manually creates passes
- `/api/payment/verify` calls fix-stuck-payment then updates registration

---

## Database Query Patterns

### Finding Registration by Order ID:

```typescript
// Strategy 1: OnspotPayments (most common for admin dashboard)
const onspotDoc = await db.collection('onspotPayments').doc(orderId).get();
const registrationId = onspotDoc.data()?.registrationId;

// Strategy 2: Payments collection
const paymentsSnap = await db.collection('payments')
  .where('cashfreeOrderId', '==', orderId)
  .limit(1)
  .get();
const registrationId = paymentsSnap.docs[0]?.data()?.registrationId;

// Strategy 3: Extract from orderId format
if (orderId.startsWith('admin_')) {
  const parts = orderId.split('_');
  const registrationId = parts[1]; // admin_{registrationId}_{timestamp}
}

// Strategy 4: Direct lookup (fallback)
const regDoc = await db.collection('registrations').doc(orderId).get();
if (regDoc.exists) {
  const registrationId = orderId;
}
```

### Checking Payment Status:

```typescript
// Check if payment already processed
const paymentsSnap = await db.collection('payments')
  .where('cashfreeOrderId', '==', orderId)
  .limit(1)
  .get();
const status = paymentsSnap.docs[0]?.data()?.status; // 'success' = already processed

// Or check onspotPayments
const onspotDoc = await db.collection('onspotPayments').doc(orderId).get();
const status = onspotDoc.data()?.status; // 'success' = already processed
```

---

## Recommendations

1. **Add Firestore Trigger** (Cloud Functions):
   ```typescript
   // Trigger on registrations document update
   exports.onRegistrationStatusChange = functions.firestore
     .document('registrations/{registrationId}')
     .onUpdate(async (change, context) => {
       const before = change.before.data();
       const after = change.after.data();
       
       if (before.status !== 'converted' && after.status === 'converted') {
         // Create payment document
         // Create pass document
         // Update admin_dashboard
       }
     });
   ```

2. **Add registrationId to payments collection** when creating orders

3. **Standardize order ID format** across all flows

4. **Add database indexes** for common queries:
   - `onspotPayments.cashfreeOrderId`
   - `payments.cashfreeOrderId`
   - `registrations.status + createdAt`

---

## Current Webhook Implementation

The webhook is correctly implemented to:
- ✅ Verify Cashfree signature
- ✅ Detect successful payments
- ✅ Find registration by orderId
- ✅ Update registration.status = "converted"
- ✅ Return 200 immediately (async processing)

The webhook **does NOT**:
- ❌ Create payment documents
- ❌ Create pass documents
- ❌ Send emails
- ❌ Generate QR codes

These should be handled by a Firestore trigger or separate process.
