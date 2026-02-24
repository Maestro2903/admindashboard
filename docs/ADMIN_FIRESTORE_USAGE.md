## Firestore usage map (Admin Dashboard)

This repo primarily uses the **Firebase Admin SDK** (`firebase-admin`) for all Firestore access (route handlers + server utilities + scripts). No usage of client Firestore SDK primitives like `getDocs()` was found.

### Legend

- **Context**:
  - **API**: Next.js route handler under `app/api/**`
  - **Server lib**: shared server utility under `lib/**`
  - **Script**: node script under `scripts/**`
- **Unsafe exposure (in this doc)** means *risk of data overfetch, unbounded reads, client-side filtering after wide reads, or missing/weak server filtering* (not “publicly accessible”, since endpoints are still behind auth helpers).

---

## Inventory of Firestore queries

### `lib/firebase/adminApp.ts` (Server lib)

- **Usage**: initializes `firebase-admin` app and exposes:
  - `getAdminAuth()` → used for ID token verification
  - `getAdminFirestore()` → used for all server-side Firestore reads/writes
- **Collections**: none directly (plumbing only)

### `lib/admin/requireOrganizer.ts` (Server lib)

- **Query**: `db.collection('users').doc(decoded.uid).get()`
- **Collection**: `users`
- **Filters**: document id = token UID
- **Fields read**: expects `isOrganizer` boolean
- **Unsafe exposure**: low (single-doc read)

### `lib/admin/requireAdminRole.ts` (Server lib)

- **Query**: `db.collection('users').doc(uid).get()`
- **Collection**: `users`
- **Fields read**: expects `adminRole` string
- **Assumption note**: missing/invalid role defaults to `'manager'`

### `lib/admin/adminLogger.ts` (Server lib)

- **Write**: `db.collection('admin_logs').add({...})`
- **Collection**: `admin_logs`
- **Fields written**: stores `previousData` / `newData` with a **sanitize/redact** step for certain keys
- **Unsafe exposure**: low; does store full-ish snapshots (sanitized) which can still be large documents

### `lib/admin/buildAdminDashboard.ts` (Server lib)

- **Purpose**: “materializes” per-user documents into `admin_dashboard/{userId}`.
- **Queries**:
  - `users/{userId}` doc read
  - `payments.where('userId','==',userId).get()`
  - `passes.where('userId','==',userId).get()`
  - `teams.where('leaderId','==',userId).get()`
  - For derived meta: fetches `events/{eventId}` docs for all referenced event IDs
- **Collections**: `users`, `payments`, `passes`, `teams`, `events`, `admin_dashboard`
- **Filters**: equality filters by `userId` / `leaderId`
- **Sort / pagination**: none
- **Fields selected**: full docs; then mapped into a narrower `AdminDashboardDoc` shape
- **Unsafe exposure**:
  - **Potentially large reads** if a user has many payments/passes/teams.
  - **Event resolution fan-out**: `Promise.all([...eventIds].map(doc.get))` can become large.

---

## Route handlers (Next.js `app/api/**`)

### `app/api/users/route.ts` (API)

- **Query**: `db.collection('users').orderBy('createdAt','desc').get()` (fallback to `.get()` without order)
- **Collection**: `users`
- **Filters**:
  - No Firestore filter; archived filtering is done **in-memory**: `isArchived !== true`
  - Optional query param: `includeArchived=1` toggles the in-memory filter
- **Sort**: server attempts `orderBy('createdAt','desc')` (falls back if index/field missing)
- **Pagination**: none (fetches entire collection)
- **Fields selected**: full docs; returns mapped subset (id, name, email, college, phone, isOrganizer, createdAt, updatedAt, referralCode, inviteCount, dayPassUnlocked, isArchived)
- **Unsafe exposure**:
  - **Fetches entire `users` collection** on every call (scales poorly; expensive).

### `app/api/payments/route.ts` (API)

- **Query**: `db.collection('payments').orderBy('createdAt','desc').get()` (fallback to `.get()` without order)
- **Collections**: `payments`, then joins `users` by doc id:
  - `Promise.all(userIds.map(id => db.collection('users').doc(id).get()))`
- **Filters**:
  - In-memory archived filter: `isArchived !== true` unless `includeArchived=1`
  - In-memory event filter: `eventId` via `getEventIdsFromPayment(data)` plus optional `eventCategory` / `eventType`
- **Sort**: best-effort by `createdAt`
- **Pagination**: none (fetches entire `payments` collection)
- **Fields selected**: full docs; response includes name/email derived from `users`
- **Unsafe exposure**:
  - **Fetches entire `payments` collection** then filters in memory.
  - **N+1 join** to `users` by IDs (bounded by unique user IDs in result, but still potentially large).

### `app/api/passes/route.ts` (API)

- **Query**: `db.collection('passes').orderBy('createdAt','desc').get()` (fallback to `.get()` without order)
- **Collection**: `passes`
- **Filters**: in-memory `isArchived !== true` unless `includeArchived=1`
- **Pagination**: none (fetches entire `passes` collection)
- **Unsafe exposure**: **fetches entire `passes` collection**

### `app/api/me/route.ts` (API)

- **Query**: `db.collection('users').doc(uid).get()`
- **Collection**: `users`
- **Fields**: returns `adminRole` (validated against `viewer|manager|superadmin`)
- **Unsafe exposure**: low (single-doc read)

### `app/api/dashboard/route.ts` (API)

- **Collection**: `admin_dashboard`
- **Query shape**:
  - Base: `db.collection('admin_dashboard').orderBy('updatedAt','desc').limit(limit)`
  - Optional **one-of** filters (mutually exclusive due to `else if` chain):
    - `where('profile.college','==',college)`
    - `where('filterPassTypes','array-contains',passType)`
    - `where('filterPaymentStatuses','array-contains',paymentStatus)`
    - `where('filterEventIds','array-contains',eventId)`
    - `where('filterEventCategories','array-contains',eventCategory)`
    - `where('filterEventTypes','array-contains',eventType)`
  - Cursor pagination: `startAfter(cursorDoc)` where cursor doc is `admin_dashboard/{cursor}`
- **Pagination**: `limit` + `cursor` (document id cursor)
- **Unsafe exposure**:
  - Composite indexes may be needed for `where(...) + orderBy('updatedAt')` patterns (depending on Firestore rules/index config).

### `app/api/stats/route.ts` (API)

- **Queries** (parallel):
  - `payments.get()` (full collection)
  - `passes.get()` (full collection)
  - `teams.get()` (full collection)
  - `users.count().get()` (aggregation)
- **Collections**: `payments`, `passes`, `teams`, `users`
- **Filters**: all computed in memory (e.g., `payments.status === 'success'`)
- **Unsafe exposure**:
  - **Fetches entire collections** (`payments`, `passes`, `teams`) to compute stats.
  - This is a prime “cost/perf” hotspot as data grows.

### `app/api/fix-stuck-payment/route.ts` (API)

- **Collections**: `events`, `payments`, `passes`, `teams`, `users` (plus writes to `passes` and updates to `payments`/`teams`)
- **Key queries**:
  - Resolve events:
    - `events/{id}.get()` OR `events.where('allowedPassTypes','array-contains',passType).limit(50).get()`
  - Locate payment by Cashfree order id:
    - `payments.where('cashfreeOrderId','==',orderId).limit(1).get()`
  - Locate existing pass:
    - `passes.where('paymentId','==',orderId).limit(1).get()` (**note**: compares `paymentId` to orderId)
  - Optional team join:
    - `teams/{teamId}.get()` then `teams/{teamId}.update({ passId, paymentStatus:'success', eventIds?... })`
  - Create new pass:
    - `passes.doc().set(passData)` (includes `eventIds`, `selectedEvents`, `teamSnapshot`, QR code URL)
  - Backfill payment metadata if missing:
    - `paymentDoc.ref.update({ eventIds, eventCategory?, eventType? })`
  - Email recipient:
    - `users/{userId}.get()`
- **Pagination**: uses `.limit(1)` for lookups; otherwise `.limit(50)` for events by passType
- **Unsafe exposure / fragility**:
  - The pass lookup uses `passes.where('paymentId','==',orderId)` which assumes `paymentId` stores the **Cashfree order id** (not the payment document id). Other parts of the code treat `paymentId` as a payments doc id.
  - Writes include embedding `teamSnapshot` into pass docs; this snapshot can drift from source `teams` docs.

---

## Admin route handlers (`app/api/admin/**`)

### `app/api/admin/passes/route.ts` (API)

- **Primary query**:
  - `passes.where('passType','==',type).limit(500).get()`
  - **No `orderBy` in query**; sorts by `createdAt` in memory to avoid composite index.
- **In-memory filters**:
  - `isArchived !== true`
  - Optional `eventId` via `getEventIdsFromPass(data)` + optional `eventCategory`/`eventType`
  - Optional date window: `from/to` applied by comparing `createdAt` in-memory
- **Joins (fan-out doc reads)**:
  - `users/{userId}.get()` for all unique `userId`s
  - `payments/{paymentId}.get()` for all unique `paymentId`s
  - (group events) `teams/{teamId}.get()` for all unique team IDs
  - `events/{eventId}.get()` for all unique selected event IDs
- **Post-join filter**:
  - Drops passes unless `payments[paymentId].status === 'success'`
- **Pagination method**:
  - Server fetches up to 500 passes per type, then slices `recordsAll` by `(page,pageSize)` in memory.
- **Fields selected**: full docs; response is a flattened `PassManagementRecord` with derived `eventName`, `userName`, and optional `team` payload.
- **Unsafe exposure**:
  - **Wide reads**: up to 500 passes per call per type; plus doc fan-out joins.
  - **Pagination is not Firestore-native** (reads a fixed batch then slices), so page 5 still reads the first 500 candidates.
  - Potentially inconsistent semantics if `paymentId` is missing or if payments are not success-filtered in Firestore.

### `app/api/admin/unified-dashboard/route.ts` (API)

- **Base query (passes)**:
  - Starts with `db.collection('passes')`
  - Optional Firestore filters:
    - `where('passType','==',passType)`
    - `where('selectedEvents','array-contains',eventId)`
    - `where('eventCategory','==',eventCategory)`
    - `where('eventType','==',eventType)`
    - `where('createdAt','>=',fromDate)` / `where('createdAt','<=',toDate)` (if parseable)
  - Always: `orderBy('createdAt','desc')`
  - Pagination:
    - Cursor: `startAfter(cursorDoc)` where cursorDoc = `passes/{cursor}`
    - Else page-based: increases `limit` and then slices in memory
  - Uses a scan multiplier: `limit(pageSize*5)` (capped) to compensate for post-join filtering.
- **Joins**:
  - Fetches referenced `users/{userId}`, `payments/{paymentId}`, `events/{eventId}`
  - Derives event name from event docs + pass/team context
- **Success filtering**:
  - After join, payments with `status !== 'success'` are excluded (“success-only filter applied after join”).
- **Financial mode extra aggregation**:
  - For `mode=financial`, does `basePassQuery.limit(10000).get()` then joins payments and sums `amount` where `status==='success'`.
- **Unsafe exposure**:
  - Composite index requirements likely for some `where + orderBy(createdAt)` combinations (depends on deployed indexes).
  - Financial mode can be heavy (pass query up to 10k + payment fan-out).

### `app/api/admin/events/route.ts` (API)

- **Query**:
  - If `activeOnly` (default): `events.where('isActive','==',true).get()`
  - Else: `events.orderBy('name','asc').get()`
- **Filter**: in-memory `isArchived !== true` unless `includeArchived=1`
- **Sorting**: always sorts by name in-memory to avoid composite index needs

### `app/api/admin/events/[eventId]/route.ts` (API)

- **Queries**:
  - `events/{eventId}.get()`
  - `passes.where('selectedEvents','array-contains',eventId).get()`
  - Best-effort extra query (optional): `passes.where('eventIds','array-contains',eventId).get()` (wrapped in try/catch)
- **Derived metrics**: counts check-ins by `pass.status==='used' || usedAt`
- **Unsafe exposure**: event-level pass enumeration can grow large; no pagination.

### `app/api/admin/events/[eventId]/export/route.ts` (API)

- **Queries**:
  - Same pass enumeration as above (`selectedEvents` + optional `eventIds`)
  - User join: `users/{userId}.get()` for distinct user IDs
- **Output**: CSV (server-side)
- **Unsafe exposure**: potentially large export; no pagination, but export route is rate-limited.

### `app/api/admin/export/teams/route.ts` (API)

- **Query**: `teams.orderBy('teamName','asc').get()`
- **Filter**: in-memory `isArchived !== true` unless `includeArchived=1`
- **Derived**: `checkedIn` computed by iterating `members[*].attendance.checkedIn`
- **Unsafe exposure**: full teams export (entire collection).

### `app/api/admin/teams/[teamId]/route.ts` (API)

- **Query**: `teams/{teamId}.get()`
- **Returns**: `members[*].attendance.checkedIn` (fallback to `m.checkedIn`)

### `app/api/admin/logs/route.ts` (API)

- **Query**: `admin_logs.orderBy('timestamp','desc').limit(limit).get()`
- **Pagination**: `limit` only (no cursor)

### `app/api/admin/scan-verify/route.ts` (API)

- **Query**:
  - `passes/{passId}.get()` from a verified QR payload
  - Optional: `users/{userId}.get()` to return name for UX
- **Writes**: none (verification-only)

### Mutation handlers (`app/api/admin/update-*.ts`, `app/api/admin/passes/[passId]`, `app/api/admin/bulk-action`)

These handlers share a common pattern:

- **Read existing doc** (`doc.get()`) → compute updates → **write** (`update` / `delete`) → **log** to `admin_logs`.
- **Collections**:
  - `update-user` → `users`
  - `update-payment` → `payments`
  - `update-team` → `teams`
  - `update-pass` → `passes` (optionally generates a QR code and writes `qrCode` field)
  - `update-event` → `events`
  - `passes/[passId]` → `passes` (mark used/revert used; delete)
  - `bulk-action` → dynamic collection among `passes|payments|teams|users|events`
- **Unsafe exposure**:
  - `bulk-action` can hard-delete documents (payments/passes) and is generic; correctness relies on robust validation and role gating.

---

## Scripts (`scripts/**`)

### `scripts/admin/export-firestore-json.js` (Script)

- **Queries**:
  - Generic: `db.collection(name).orderBy(...).limit(30).get()` with fallback to unordered limit
  - Targeted doc reads: `payments/{id}.get()`, `teams/{id}.get()`
- **Collections**: `payments`, `registrations`, `scans`, `teams`, `test`
- **Derived field**: for payments exports, adds `success` boolean from `status` if missing.

### `scripts/admin/backfill-admin-dashboard.js` (Script)

- **Queries**:
  - Full scans: `users.get()`, `payments.get()`, `passes.get()`, `teams.get()` to collect distinct user IDs
  - Per-user rebuild: reads `users/{uid}`, `payments.where(userId==uid)`, `passes.where(userId==uid)`, `teams.where(leaderId==uid)`
  - Writes: `admin_dashboard/{uid}.set(...)`
- **Unsafe exposure**: intentionally bulk; should be run sparingly.

### `scripts/admin/db-inspect.js` (Script)

- **Queries**:
  - For each collection in a fixed list, runs `.limit(3000).get()` and `.limit(2).get()` (samples)
  - Samples: `passes.orderBy('createdAt','desc').limit(1).get()`
- **Collections**: `users`, `payments`, `passes`, `teams`, `events`, `admin_dashboard`, `admin_logs`

### `scripts/migrations/backfill-event-ids.js` (Script)

- **Queries**:
  - Loads all `events`, `passes`, `payments`, `teams` (full collection scans)
  - Writes in batches (`batch.update`) to set `eventIds`, and sometimes `selectedEvents`, `eventCategory`, `eventType`
- **Index note**: uses full scans to avoid index complexity.

