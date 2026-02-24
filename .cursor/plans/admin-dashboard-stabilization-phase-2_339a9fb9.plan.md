---
name: admin-dashboard-stabilization-phase-2
overview: Refactor the Next.js 16 + Firebase Admin dashboard backend to harden security, eliminate full collection scans, align on payments as the financial source of truth, fix date/attendance data shapes, and add Firestore indexes, without changing UI layout or removing features.
todos:
  - id: fix-admin-role-default
    content: Change `parseRole` in `requireAdminRole` to default invalid/missing roles to 'viewer' and confirm financial mode requires 'superadmin'.
    status: pending
  - id: paginate-users-payments-passes
    content: Refactor `/api/users`, `/api/payments`, and `/api/passes` to use Firestore-native pagination and update `useUsers`/`usePayments` hooks to walk pages under the hood.
    status: pending
  - id: payments-source-of-truth
    content: Audit admin APIs to ensure financial correctness is derived only from `payments.status === 'success'` and remove reliance on `payment.success` or `team.paymentStatus`.
    status: pending
  - id: standardize-pass-payment-link
    content: Normalize pass-to-payment joins to use `passes.paymentId` as the Firestore `payments` doc ID with well-documented fallbacks for legacy `cashfreeOrderId` mismatches.
    status: pending
  - id: harden-date-filters
    content: Ensure all admin date filters parse query params into `Date` objects and apply comparisons server-side using Firestore where clauses or Date arithmetic, never string comparisons.
    status: pending
  - id: normalize-team-attendance
    content: Standardize team member attendance shape on `members[*].attendance` and update all relevant endpoints to read/emit only this form.
    status: pending
  - id: payments-first-joins
    content: Rework unified dashboard (and related) queries to filter by successful payments first, then fetch passes via `paymentId in [...]` batched queries to avoid post-join success filtering.
    status: pending
  - id: stats-aggregation-refactor
    content: Rewrite `/api/stats` to use count aggregations and paged revenue calculations instead of full collection scans.
    status: pending
  - id: null-and-type-safety
    content: Tighten null handling and TypeScript types in `types/admin.ts` and all admin API responses (selectedDays/events, teamId, usedAt, createdAt, etc.).
    status: pending
  - id: firestore-index-updates
    content: Extend `firestore.indexes.json` with indexes for passes(paymentId ASC) and events(isActive ASC, name ASC), preserving existing definitions.
    status: pending
isProject: false
---

## Stabilization & Alignment Plan (Phase 2)

### Scope

- **In-scope**: Backend/server logic (Next.js route handlers), Firestore query patterns, data joins, pagination, type definitions, Firestore index config, and null/type safety.
- **Out-of-scope**: Any UI layout/CSS changes, column additions/removals, or feature removals; client components can be minimally adjusted only where necessary to preserve behavior (e.g., hooks walking pages under the hood) without changing visible layout.

---

### Step 1 — Fix Role Fallback Bug

- **Files**: 
  - `[lib/admin/requireAdminRole.ts](lib/admin/requireAdminRole.ts)`
  - `[types/admin.ts](types/admin.ts)`
- **Changes**:
  - Update `parseRole` so that any missing/invalid `adminRole` value resolves to `'viewer'` instead of `'manager'`.
    - Keep `VALID_ROLES` as `['viewer','manager','superadmin']`.
    - Ensure the function comment reflects the new default.
  - Confirm all role guard helpers already enforce financial-mode restrictions:
    - `canMutateUsersPaymentsEvents` remains `role === 'superadmin'`.
    - `requireAdminRole`-based routes (notably `/api/admin/unified-dashboard`) must check `adminRole === 'superadmin'` for `mode=financial` (already present; retain and treat as policy).
  - Optionally tighten typings to ensure `AdminRole` is only consumed via `requireAdminRole` for admin APIs, reducing risk of ad-hoc string roles.

---

### Step 2 — Remove Full Collection Scans (Pagination)

- **Files**:
  - `[app/api/users/route.ts](app/api/users/route.ts)`
  - `[app/api/payments/route.ts](app/api/payments/route.ts)`
  - `[app/api/passes/route.ts](app/api/passes/route.ts)`
  - `[app/api/stats/route.ts](app/api/stats/route.ts)` — partially, for metrics/revenue reads
  - `[app/api/admin/passes/route.ts](app/api/admin/passes/route.ts)`
  - `[app/api/admin/unified-dashboard/route.ts](app/api/admin/unified-dashboard/route.ts)`
  - Hooks:
    - `[hooks/use-users.ts](hooks/use-users.ts)`
    - `[hooks/use-payments.ts](hooks/use-payments.ts)`
- **General pagination pattern**:
  - Introduce shared helpers (or inline per-route for now) to:
    - Parse `pageSize` (with sane caps per endpoint) and an optional `cursor` (string doc ID or encoded cursor token).
    - Build Firestore queries with `.orderBy('createdAt','desc').limit(pageSize)` and `.startAfter(lastDoc)` when a cursor is provided.
    - Return `{ items, nextCursor }` shape from the backend.
  - Prefer doc-ID-based cursors for simplicity: use the last document of the previous page (`doc.id`) and call `collection.doc(cursor).get()` to create the `startAfter` anchor.
- **/api/users**:
  - Replace `db.collection('users').orderBy('createdAt','desc').get()` with paginated query:
    - Default `pageSize` (e.g. 200) if unspecified; enforce an upper bound (e.g. 500).
    - Support `cursor` query param that is a `users/{id}` doc ID.
  - Response shape:
    - Maintain `users: [...]` for backward compatibility.
    - Add `nextCursor: string | null` field.
  - **Hook behavior** (`useUsers`):
    - On mount/refresh, loop through pages by following `nextCursor` until either:
      - No `nextCursor` (end reached), or
      - A hard safety cap is hit (e.g. 5 pages or 5k users), to avoid runaway loops.
    - Concatenate `users` from each page into a single array exposed to the UI, so existing screens still see “all” data while removing single-call full scans.
- **/api/payments**:
  - Mirror the same pagination pattern: `orderBy('createdAt','desc')`, `limit(pageSize)`, optional `cursor` as doc ID.
  - Preserve existing response shape (`payments: [...]`) and add `nextCursor`.
  - Preserve filters currently done in memory (eventId/category/type) where they cannot be safely pushed into the query without new composite indexes; otherwise push down to Firestore where feasible.
  - **Hook behavior** (`usePayments`):
    - Same pattern as `useUsers`: walk pages by following `nextCursor`, aggregating into a single `payments` array.
    - Respect a ceiling (e.g. 10k payments) as a safety guard.
- **/api/passes**:
  - Replace `.orderBy('createdAt','desc').get()` with paginated query like users/payments.
  - Apply `includeArchived` filter via query where possible (if `isArchived` indexed) or by lightweight in-memory filter post-query on each page.
  - Return `{ passes, count: passes.length, nextCursor }` and document the new pagination fields.
- **/api/admin/passes (PassManagementView)**:
  - Currently fetches up to `MAX_FETCH_LIMIT` passes in a single query, then sorts and slices in memory:
    - This already avoids a literal full collection scan, but still risks heavy reads for large cardinalities and uses page-based slicing (`slice(start, start + pageSize)`).
  - Replace page-based slicing with **Firestore-native cursor pagination**:
    - Keep `orderBy('createdAt','desc')` in the query and remove the in-memory sort.
    - Use `limit(pageSize)` per request; when `cursor` query param is provided, do `startAfter(lastDoc)`.
    - Remove `(page - 1) * pageSize` slicing; rely solely on `cursor`.
  - Limit pre-join window to a small multiplier of `pageSize` only when necessary (e.g. to account for filters not expressed in the query), but avoid 500-doc hard pulls irrespective of page.
  - Adjust response type `PassManagementResponse` (if needed) to include `nextCursor?: string | null` for consistency.
- **/api/admin/unified-dashboard**:
  - This route already uses `cursor`-based pagination but still:
    - Builds `basePassQuery` that may load many docs.
    - Filters non-success payments *after* joining.
  - For the **operations/financial views**:
    - Retain `cursor`-first pagination (since clients already use `nextCursor` and `cursorStack`).
    - Reduce the `scanLimit` used for the primary pass query to `pageSize` (or a small multiple) and avoid scanning `page * pageSize` when `page > 1`; prefer `cursor` exclusively for paging.
    - See Step 7 for restructuring around payments-first joins; the pagination piece here is to ensure only a small window of passes is read per page.
- **/api/stats**:
  - See Step 8 for the main redesign; pagination here is more about using `.count()` and batched payment reads rather than unbounded `collection.get()` on `payments`, `passes`, and `teams`.

---

### Step 3 — Make Payments the Source of Truth

- **Files**:
  - `[app/api/admin/unified-dashboard/route.ts](app/api/admin/unified-dashboard/route.ts)`
  - `[app/api/admin/passes/route.ts](app/api/admin/passes/route.ts)`
  - `[app/api/stats/route.ts](app/api/stats/route.ts)`
  - `[app/api/admin/export/teams/route.ts](app/api/admin/export/teams/route.ts)`
  - `[app/api/admin/teams/[teamId]/route.ts](app/api/admin/teams/[teamId]/route.ts)`
  - Possibly: `[app/api/admin/update-team/route.ts](app/api/admin/update-team/route.ts)` and other admin routes that infer financial status.
- **Changes**:
  - Introduce `PaymentStatus` union in `types/admin.ts` (see Step 10) and enforce `payments.status` usage everywhere.
  - **Remove or ignore** any fields like:
    - `payment.success` (boolean) if present in Firestore docs or intermediate shapes.
    - `team.paymentStatus` as a source of financial truth; treat it only as a denormalized display hint if absolutely necessary.
  - In joins:
    - For passes, teams, and stats, only consider a payment “valid” if its `status === 'success'`.
    - Any other status (`'pending'`, `'failed'` or missing) must be treated as non-success, irrespective of denormalized flags.
  - For stats and dashboard metrics:
    - Revenue and counts must derive **only** from `payments` where `status == 'success'`.

---

### Step 4 — Fix Pass ↔ Payment Link Consistency

- **Files**:
  - `[app/api/admin/unified-dashboard/route.ts](app/api/admin/unified-dashboard/route.ts)`
  - `[app/api/admin/passes/route.ts](app/api/admin/passes/route.ts)`
  - Any mutation/fix routes such as `[app/api/admin/passes/[passId]/fix-payment/route.ts](app/api/admin/passes/[passId]/fix-payment/route.ts)`
- **Standardization**:
  - Normalize join logic so that:
    - `passes.paymentId` is assumed to be a **Firestore `payments` document ID**.
    - Any other external identifiers like `cashfreeOrderId` are treated as payment metadata only.
  - Where current code falls back to matching on `cashfreeOrderId`:
    - Update it to first attempt `passes.paymentId` → `payments/{id}`.
    - Only if `paymentId` is missing, and a specific route is explicitly a “fixup” endpoint, allow a controlled lookup by `cashfreeOrderId` within a **bounded window** (e.g., `where('cashfreeOrderId','==', value).limit(5)`), then surface discrepancies rather than silently joining on non-ID fields.
  - Add **explicit comments and type hints** in the join code paths documenting that `paymentId` is the primary foreign key, and `cashfreeOrderId` is not used for relational joining except in explicit repair workflows.

---

### Step 5 — Fix Date Filtering Bug

- **Files**:
  - `[app/api/admin/passes/route.ts](app/api/admin/passes/route.ts)` (already doing Date parsing, but confirm filters)
  - `[app/api/admin/unified-dashboard/route.ts](app/api/admin/unified-dashboard/route.ts)`
  - Any other admin routes that accept `from` / `to` or similar date params.
  - Types:
    - `UnifiedDashboardQuery` and `PassFiltersState` in `[types/admin.ts](types/admin.ts)`
- **Changes**:
  - Server-side:
    - Ensure all date query params (`from`, `to`, `dateFrom`, `dateTo`) are parsed into `Date` objects.
    - For Firestore query pushdown:
      - Use `where('createdAt','>=', fromDate)` and `where('createdAt','<=', toDate)` with Date values.
      - When more complex combinations would require extra indexes, fall back to **post-query filtering** using `Date` objects, never string comparisons.
    - When filtering in memory, always convert Firestore Timestamps (or `toDate()` results) → `Date` and compare `date.getTime()`.
  - Client-side:
    - Leave filters as ISO/date-input strings in query params, but **never rely on `r.createdAt >= filters.from` string comparisons** on the client; keep all filtering in the server routes.
  - Types:
    - Clarify via `UnifiedDashboardQuery` and `PassFiltersState` comments that `from`/`to` are ISO-like strings for transport only; actual semantics are implemented server-side using `Date`.

---

### Step 6 — Fix Team Attendance Shape

- **Files**:
  - `[app/api/admin/passes/route.ts](app/api/admin/passes/route.ts)` — `buildGroupEventsMembers`, `countCheckedIn`
  - `[app/api/admin/export/teams/route.ts](app/api/admin/export/teams/route.ts)` — `countCheckedIn`
  - `[app/api/admin/teams/[teamId]/route.ts](app/api/admin/teams/[teamId]/route.ts)`
  - Types:
    - `GroupEventsMember` and related types in `[types/admin.ts](types/admin.ts)`
- **Target shape**:
  - For team members, standardize on:

```ts
    members[*].attendance = {
      checkedIn: boolean,
      checkInTime: string | null,
      checkedInBy: string | null,
    };
    

```

- Remove support for legacy top-level `checkedIn` fields in API responses. They may still exist in raw Firestore for backward compatibility, but the server should normalize them into the `attendance` object.
- **Server behavior**:
  - When reading team members:
    - If `m.attendance` exists, trust it as the canonical source.
    - If only legacy `m.checkedIn` field exists, map it into `attendance.checkedIn` while constructing API response objects (do not leak bare `checkedIn` to clients).
  - Update:
    - `countCheckedIn` implementations to read from `member.attendance.checkedIn` only; if legacy fields are found, transform them into the standardized attendance object first.
    - `buildGroupEventsMembers` to always output `GroupEventsMember` with the normalized structure (`checkedIn`, `checkInTime`, `checkedInBy`), and ensure this type in `types/admin.ts` matches exactly.
  - Ensure the following surfaces only expose the normalized attendance:
    - Teams table data (via `/api/admin/export/teams` and any teams listing endpoints).
    - Pass management view for group events (via `/api/admin/passes`).
    - Unified view joins where team attendance aggregates are shown.

---

### Step 7 — Eliminate Post-Join Success Filtering (Payments-First)

- **Files**:
  - `[app/api/admin/unified-dashboard/route.ts](app/api/admin/unified-dashboard/route.ts)`
  - `[app/api/admin/passes/route.ts](app/api/admin/passes/route.ts)` (if it filters by payment success post-join)
- **Current issue**:
  - Passes are queried, joined to payments, and only then non-`success` payments are filtered out, causing over-reading.
- **New strategy**:
  - **Phase 1: Payments-first ID selection**:
    - For the given filters (passType, eventId, category, type, from, to), derive a corresponding **payments** query where `status == 'success'` that returns payment IDs in a paginated way.
      - Example conceptual flow for unified dashboard page:
        1. Build a `payments` query:
          - `where('status', '==', 'success')`.
          - Where possible, include `passType`, `eventIds`, or time range filters based on how payments store these attributes.
          - Use `orderBy('createdAt','desc').limit(pageSize)` + cursor.
        2. Collect `paymentIds` from this page.
    - When some filters are only present on passes, you may still need a second step on passes, but the key is to restrict attention to passes whose `paymentId` is in a small set.
  - **Phase 2: Pass lookup by payment IDs**:
    - For each page of payment IDs (max 10 at a time due to Firestore `in` limits):
      - Run `db.collection('passes').where('paymentId','in', batchIds)`.
      - Merge results into a single pass page.
    - Respect Firestore constraints:
      - Batch payment IDs into groups of 10.
      - For each group, perform one passes query.
  - **Pagination alignment**:
    - Align page semantics to be **payments-driven**: a “page” is defined by a window of successful payments and their associated passes.
    - Expose a `nextCursor` token tied to the payments query (e.g., last payment doc ID), and reuse it for subsequent calls.
  - **Fallback / incremental approach**:
    - If refactoring the entire unified dashboard to payments-first in one go is too invasive, at minimum:
      - Add an early filter on `paymentsById` to only fetch `status == 'success'` documents.
      - Build `paymentIds` from payments where `status == 'success'` only, then restrict pass doc window (`scanLimit`) accordingly.
      - This significantly reduces reads vs. pass-first scanning while still moving towards a fully payments-first model.

---

### Step 8 — Fix Stats Endpoint (Aggregations)

- **File**:
  - `[app/api/stats/route.ts](app/api/stats/route.ts)`
- **Current**:
  - `payments.get()`, `passes.get()`, `teams.get()` load entire collections, then compute counts and revenue in memory.
- **New plan**:
  - **Counts**:
    - `totalUsers`: already uses `db.collection('users').count().get()`; keep.
    - `totalSuccessfulPayments`: use `db.collection('payments').where('status','==','success').count().get()`.
    - `pendingPayments`: use `db.collection('payments').where('status','==','pending').count().get()`.
    - `teamsRegistered`: use `db.collection('teams').count().get()`.
    - `activePasses`: `db.collection('passes').where('status','==','paid').count().get()`.
    - `usedPasses`: `db.collection('passes').where('status','==','used').count().get()`.
  - **Revenue**:
    - Use paged reads on `payments.where('status','==','success')`:
      - `orderBy('createdAt','desc').limit(batchSize)` with cursor.
      - Sum `amount` fields across pages until either:
        - All docs are covered (for smaller datasets), or
        - A configured maximum time-window or page cap is reached, if necessary.
    - Where feasible, restrict to a recent time window for performance, but keep semantics clear (e.g., “lifetime revenue” vs. “recent revenue”).
  - **Pass distribution**:
    - Instead of iterating over all passes with in-memory cross-checks against payment status, compute distribution via:
      - A limited-time-window query on passes (`where('status','in',['paid','used'])`) combined with a pre-built `paymentStatusById` map only from `payments.where('status','==','success')` paged reads.
      - Or approximate using successful payments per `passType` (which may be more aligned with Step 3’s source-of-truth rule).
  - **Registrations today/yesterday**:
    - Continue to use payments as the source:
      - `payments.where('status','==','success').where('createdAt','>=', todayStart).where('createdAt','<=', todayEnd)` and similar for yesterday.
    - Use paginated reads for safety if the set is large.
  - **Activity feed**:
    - For “recent” events, limit to small windows:
      - `payments.where('status','==','success').orderBy('createdAt','desc').limit(10)`.
      - `passes.where('status','==','used').orderBy('usedAt','desc').limit(10)`.
      - `teams.orderBy('createdAt','desc').limit(5)`.
    - Avoid full collection loads; rely on orderBy+limit.

---

### Step 9 — Harden Null Safety

- **Files**:
  - All admin APIs touched above, with emphasis on:
    - `[app/api/admin/unified-dashboard/route.ts](app/api/admin/unified-dashboard/route.ts)`
    - `[app/api/admin/passes/route.ts](app/api/admin/passes/route.ts)`
    - `[app/api/admin/export/teams/route.ts](app/api/admin/export/teams/route.ts)`
    - `[app/api/admin/teams/[teamId]/route.ts](app/api/admin/teams/[teamId]/route.ts)`
    - `[app/api/stats/route.ts](app/api/stats/route.ts)`
  - Types: `[types/admin.ts](types/admin.ts)`
- **Rules to enforce**:
  - For arrays:
    - Ensure `selectedDays ?? []` and `selectedEvents ?? []` at the API response boundary; never leak `undefined` or raw Firestore array shapes.
  - For IDs and optional fields:
    - `teamId ?? null`, `usedAt ?? null`, `scannedBy ?? null` as appropriate.
    - Wherever `createdAt` is part of the admin record or dashboard response, ensure it **always exists** and is a string ISO timestamp.
      - Fallback to a sentinel (`new Date(0).toISOString()`) only if necessary, but log when this happens.
  - Update server mappers so that all exported types in `types/admin.ts` are actually honored (no extra properties, and no missing required fields).
  - Add defensive guards around any deep property access (e.g., `teamSnapshot.members`) to avoid `undefined` dereferences.

---

### Step 10 — Type Safety Enforcement

- **File**:
  - `[types/admin.ts](types/admin.ts)`
- **Changes**:
  - Ensure the following strict unions are defined and exported:

```ts
    export type PaymentStatus = 'success' | 'pending' | 'failed';
    export type PassStatus = 'paid' | 'used';
    export type AdminRole = 'viewer' | 'manager' | 'superadmin';
    

```

- Replace any looser usages of payment status strings:
  - E.g., `paymentStatus: string` → `paymentStatus: PaymentStatus` where appropriate.
  - `FinancialRecord.paymentStatus` and `AdminRecord.paymentStatus` should be narrowed if feasible; where legacy data may include unknown statuses, use a mapping layer that coerces unknowns into `'failed'` or a safe default before assigning.
- Update helper functions (`canMutatePasses`, `canMutateTeams`, etc.) to accept `AdminRole` explicitly.
- Where exhaustive branching is used on these unions, rely on TypeScript’s exhaustive switch checks (and follow the project’s `typescript-exhaustive-switch` rule if present).

---

### Step 11 — Index Generation

- **File**:
  - `[firestore.indexes.json](firestore.indexes.json)`
- **Existing vs required**:
  - Already present:
    - `passes(passType ASC, createdAt DESC)`.
    - `payments(status ASC, createdAt DESC)`.
    - `passes(selectedEvents ARRAY_CONTAINS, createdAt DESC)` (via the `selectedEvents` index).
  - To add/confirm:
    - `passes(paymentId ASC)`:
      - Add an index entry with `collectionGroup: 'passes'`, `queryScope: 'COLLECTION'`, and a single `paymentId` field (`order: 'ASCENDING'`).
    - `events(isActive ASC, name ASC)`:
      - Add an index entry with `collectionGroup: 'events'`, `queryScope: 'COLLECTION'`, `fields: [{ fieldPath: 'isActive', order: 'ASCENDING' }, { fieldPath: 'name', order: 'ASCENDING' }]`.
  - Keep existing indexes intact and append the new required ones only.
  - After changes, document deployment command in `docs/ADMIN_FIRESTORE_USAGE.md` (e.g., `firebase deploy --only firestore:indexes`).

---

### Step 12 — Preserve UI Components and Layout

- **Files**:
  - All `app/admin/`* client components and shared UI components under `app/components` and `components/ui`.
- **Policy**:
  - Do **not** change:
    - Layout structure, CSS classes, or visible columns.
    - Visible pagination controls or filters (beyond wiring them to improved backend semantics).
  - Allowed:
    - Hook-level or data-fetching logic changes that transparently adapt to new backend contracts (e.g., walking pagination cursors behind the scenes).
    - Adjustments to parsing/typing in TypeScript client code as long as the render output remains the same.

---

### Cross-Cutting Testing & Validation

- **Manual test passes** (no code here, but to be executed after implementation):
  - Verify role behavior:
    - User with no `adminRole` in Firestore gets `viewer` permissions.
    - `manager` and `superadmin` can mutate where allowed; financial view only accessible to `superadmin`.
  - Smoke test all affected endpoints:
    - `/api/users`, `/api/payments`, `/api/passes`, `/api/stats`, `/api/admin/passes`, `/api/admin/unified-dashboard` in both modes.
  - Confirm pagination:
    - Unified, operations, and financial views still paginate correctly using `nextCursor`.
    - Users/payments screens continue to show what appears to be full lists while underlying APIs are paginated.
  - Validate stats:
    - Totals and revenue match expectations using only `payments.status === 'success'`.
  - Attendance:
    - Team exports, team detail endpoint, and pass-management group-events view all show consistent attendance derived from `members[*].attendance`.
  - Indexes:
    - Run Firestore queries that would require the new indexes and confirm no “missing index” errors.

---

### Notes on Production Safety

- Implement changes in small, well-scoped commits per step (or grouped logically), behind existing URL contracts.
- Avoid schema migrations that rewrite historical Firestore docs; instead, normalize at read-time and document any known legacy inconsistencies in `docs/ADMIN_DATA_ASSUMPTIONS.md`.
- Prefer additive response fields (e.g., `nextCursor`) over breaking changes to existing JSON shapes, except where absolutely necessary to eliminate full collection scans.

