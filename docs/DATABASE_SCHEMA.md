# Database Schema (Firestore)

This document describes the Firestore collections, document structure, field types, relationships, and index requirements used by the Admin Dashboard. Security is enforced at the API layer; the client does not write directly to these collections for admin operations.

## Collections Overview

| Collection | Document ID | Purpose |
|------------|--------------|---------|
| `users` | Firebase Auth UID | User profiles, organizer flag, admin role |
| `payments` | Auto ID | Payment records (linked to Cashfree order) |
| `passes` | Auto ID | Pass records (QR, status, usedAt) |
| `teams` | Auto ID | Team data (group events) |
| `events` | Auto ID | Event metadata |
| `admin_dashboard` | User ID | Aggregated read-optimized doc per user |
| `admin_logs` | Auto ID | Audit log entries (mutations) |

---

## users

Stores user profile and access flags. Document ID = Firebase Auth UID.

| Field | Type | Description |
|-------|------|-------------|
| `uid` | string | Same as document ID |
| `name` | string | Display name |
| `email` | string \| null | Email |
| `college` | string | College name |
| `phone` | string | Phone number |
| `isOrganizer` | boolean | If true, user can access admin dashboard |
| `adminRole` | 'viewer' \| 'manager' \| 'superadmin' | Admin role; optional, default in code is manager |
| `photoURL` | string \| null | Profile photo URL |
| `photoPath` | string \| null | Storage path for photo |
| `createdAt` | Timestamp | Creation time |
| `updatedAt` | Timestamp \| Date | Last update |
| `referralCode` | string | Optional referral code |
| `invitedUsers` | string[] | Optional list of invited user IDs |
| `inviteCount` | number | Optional invite count |
| `dayPassUnlocked` | boolean | Optional |
| `inviteUnlockedAt` | Timestamp \| Date | Optional |
| `isArchived` | boolean | Optional; used for filtering in list APIs |

Source: `lib/db/firestoreTypes.ts` (`UserProfile`), API routes that read/write users.

---

## payments

One document per payment attempt. Linked to Cashfree by `cashfreeOrderId` (or `orderId`).

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | Firestore user document ID |
| `amount` | number | Amount paid |
| `passType` | string | e.g. day_pass, group_events, proshow, sana_concert |
| `status` | 'pending' \| 'success' \| 'failed' | Payment status |
| `cashfreeOrderId` | string | Cashfree order ID (used in fix-stuck-payment lookup) |
| `orderId` | string | Same as cashfreeOrderId in some code paths |
| `createdAt` | Timestamp | When payment was created |
| `updatedAt` | Timestamp \| Date | Last update |
| `teamId` | string | For group_events; team document ID |
| `isArchived` | boolean | Soft-archive flag |
| `archivedAt` | Timestamp \| null | When archived |
| `archivedBy` | string \| null | UID of admin who archived |
| `fixedManually` | boolean | Set when fix-stuck-payment updates status to success |
| `adminNote` | string | Optional note from admin |
| `eventIds` | string[] | Canonical event document IDs (backfilled by migration) |
| `eventCategory` | string | Optional; from first event (for filtering) |
| `eventType` | string | Optional; from first event (for filtering) |

Indexes used: `status` ASC + `createdAt` DESC; `eventIds` (array-contains) + status/createdAt (see `firestore.indexes.json`).

---

## passes

One document per issued pass (created when payment succeeds, or by fix-stuck-payment).

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | Owner user ID |
| `passType` | string | day_pass, group_events, proshow, sana_concert |
| `amount` | number | Amount (from payment) |
| `paymentId` | string | Payment document ID (or Cashfree order ID where payment doc ID = order ID) |
| `status` | 'paid' \| 'used' | paid = active, used = scanned/consumed |
| `qrCode` | string | Data URL of QR image (signed payload) |
| `createdAt` | Timestamp | When pass was created |
| `usedAt` | Timestamp \| null | When pass was marked used |
| `scannedBy` | string \| null | UID of organizer who scanned |
| `teamId` | string | For group_events; team document ID |
| `teamSnapshot` | object | Snapshot of team at pass creation: teamName, totalMembers, members[] |
| `eventIds` | string[] | Canonical event IDs (required after migration; prefer over selectedEvents for queries) |
| `eventCategory` | string | Optional; from event doc (for filtering) |
| `eventType` | string | Optional; from event doc (for filtering) |
| `selectedEvents` | string[] | Event document IDs (legacy; use eventIds when present) |
| `eventId` / `selectedEvent` | string | Single event ID (legacy/alternate) |
| `selectedDay` | string | For day_pass |
| `isArchived` | boolean | Soft-archive flag |
| `archivedAt` | Timestamp \| null | When archived |
| `archivedBy` | string \| null | UID of admin who archived |
| `createdManually` | boolean | Set when pass created by fix-stuck-payment |

Indexes used: `passType` ASC + `createdAt` DESC; `status` ASC + `createdAt` DESC. Composite filters (e.g. passType + createdAt + date range) may require additional composite indexes; the passes API returns a message to run `firebase deploy --only firestore:indexes` if an index is missing.

---

## teams

Used for group events. Linked to a pass via `passId` after payment success.

| Field | Type | Description |
|-------|------|-------------|
| `leaderId` | string | User ID of team leader |
| `teamName` | string | Team name |
| `members` | array | Objects with memberId, name, phone, email, isLeader, attendance (checkedIn, checkedInAt, checkedInBy) |
| `totalMembers` | number | Member count |
| `paymentStatus` | string | e.g. pending, success |
| `passId` | string | Pass document ID after payment |
| `eventIds` | string[] | Optional; backfilled from linked pass |
| `createdAt` | Timestamp | Creation time |
| `updatedAt` | Timestamp \| Date | Last update |
| `isArchived` | boolean | Optional |

---

## events

Event metadata (name, date, venue, allowed pass types, etc.).

| Field | Type | Description |
|-------|------|-------------|
| `name` / `title` | string | Event name |
| `category` | string | Optional |
| `type` | string | Optional |
| `date` | string | Optional; primary/first day for display |
| `dates` | string[] | Optional; multi-day events list (e.g. `["26/02/26","27/02/26"]`); day-pass shows event when selected day is in this array |
| `venue` | string | Optional |
| `allowedPassTypes` | string[] | Optional |
| `isActive` | boolean | Optional |
| `isArchived` | boolean | Optional |
| `teamConfig` | object | Optional. For group events: `{ minMembers: number, maxMembers: number, pricePerPerson: number }`. Used by On-Spot Registration to enforce team size and pricing. |
| `startTime` / `endTime` | string | Optional; for display and **time conflict** checks. Use normalized format: `"10:30"`, `"14:00"` (24h) or `"10:30 AM"`. Dotted `"10.30"` is also parsed. Required for overlap detection when users select multiple events (same date + overlapping range = conflict). |

Document ID is used as `eventId` in passes (`selectedEvents` array or `eventId`).

---

## admin_dashboard

Read-optimized aggregated document **per user**. Document ID = `userId`. Built and updated by `lib/admin/buildAdminDashboard.ts` (e.g. after fix-stuck-payment or via backfill script).

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | Same as document ID |
| `profile` | object | name, email, phone, college, isOrganizer, createdAt |
| `payments` | array | { paymentId, amount, passType, status, createdAt, eventIds?, eventCategory?, eventType? } |
| `passes` | array | { passId, passType, status, amount, createdAt, usedAt?, teamId?, eventIds?, eventCategory?, eventType? } |
| `teams` | array | { teamId, teamName, totalMembers, paymentStatus, passId?, eventIds? } |
| `summary` | object | totalPayments, totalAmountPaid, totalPasses, totalTeams |
| `filterPassTypes` | string[] | Unique pass types for filtering |
| `filterPaymentStatuses` | string[] | Unique payment statuses for filtering |
| `filterEventIds` | string[] | Unique event IDs for filtering |
| `filterEventCategories` | string[] | Unique event categories for filtering |
| `filterEventTypes` | string[] | Unique event types for filtering |
| `updatedAt` | Timestamp | Last rebuild time |

Used by `GET /api/dashboard` with optional filters: `profile.college`, `filterPassTypes`, `filterPaymentStatuses`, and cursor-based pagination on `updatedAt` desc.

---

## admin_logs

Audit log for admin mutations. Each document is one log entry. Sensitive fields in `previousData` and `newData` are redacted by `lib/admin/adminLogger.ts` before writing.

| Field | Type | Description |
|-------|------|-------------|
| `adminId` | string | UID of admin who performed the action |
| `action` | string | e.g. update-payment, update-pass |
| `targetCollection` | string | passes, payments, teams, users, events |
| `targetId` | string | Document ID |
| `previousData` | object | Sanitized snapshot before change |
| `newData` | object | Sanitized snapshot after change |
| `ipAddress` | string | Optional; from x-forwarded-for or x-real-ip |
| `timestamp` | Date | Server time of log |

**Redacted keys (stored as `[REDACTED]`):** amount, qrCode, token, signature, secret, password, cashfreeOrderId, paymentId.

---

## Relationships

- **users** ← **payments**: `payments.userId` = `users.id`
- **users** ← **passes**: `passes.userId` = `users.id`
- **payments** → **passes**: `passes.paymentId` references payment doc (or order ID)
- **teams** → **passes**: `passes.teamId` = `teams.id`; `teams.passId` = `passes.id` after payment
- **passes** → **events**: `passes.eventIds` (canonical) or `passes.selectedEvents` / `eventId` / `selectedEvent` (legacy) reference `events.id`
- **payments** → **events**: `payments.eventIds` (canonical; backfilled from pass)
- **teams** → **events**: `teams.eventIds` (optional; backfilled from linked pass)
- **admin_dashboard**: One doc per user; aggregates that user’s payments, passes, teams.

---

## Indexes

Defined in `firestore.indexes.json` at project root:

1. **passes:** `passType` ASC, `createdAt` DESC (collection scope)
2. **passes:** `status` ASC, `createdAt` DESC (collection scope)
3. **payments:** `status` ASC, `createdAt` DESC (collection scope)

For composite filters (e.g. passType + createdAt + from/to date), additional composite indexes may be required. If a query fails with an index error, deploy indexes:

```bash
firebase deploy --only firestore:indexes
```

(Requires Firebase CLI and project configuration.)

---

## Security Considerations

- The **client never writes** directly to Firestore for admin data. All writes go through API route handlers.
- **Auth and role checks** are performed in the API (requireOrganizer, requireAdminRole, canMutatePasses, etc.). Firebase Admin SDK has full read/write to Firestore; security is at the application layer.
- **admin_logs** intentionally redact sensitive fields so logs can be stored without exposing payment IDs, amounts, QR data, or secrets.
