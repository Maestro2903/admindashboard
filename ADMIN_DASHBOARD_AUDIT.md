# Admin Dashboard Audit – Takshashila 2026

## 1. Executive Summary

- **Overall Grade (A–F)**: **B**
- **Critical Issues Count**: **1**
- **High Risk Issues Count**: **3**
- **Medium Risk Issues Count**: **8**

The Admin Dashboard shows a strong foundation: all admin APIs are authenticated via Firebase ID tokens and server-side role checks, payment fixes are idempotent and Cashfree-status driven, QR codes are signed server-side, and Firestore access is fully server-mediated. However, there is a **critical RBAC flaw** in bulk pass/team operations that allows any organizer (including nominally read-only “viewer” roles) to perform high-blast-radius mutations. Several performance and data-shaping paths (notably the unified dashboard) trade Firestore index complexity for heavier in-memory processing and partial result sets at scale. With the critical RBAC gap fixed and a handful of performance and UX refinements, the system can reach production-grade robustness for money and access control.

## 2. Admin Surface Map

### 2.1 Frontend Routes and Screens

**Global shell and navigation**
- **`app/components/AdminPanelShell.tsx`**
  - Wraps all non-signin pages.
  - Uses `useAuth()` and redirects to `/signin` when `!user` or `!userData?.isOrganizer`.
  - Fetches `adminRole` via `useMeRole` (calls `GET /api/me`) and enforces additional client-side gating for `/admin/registrations`.
- **`components/admin/AppSidebar.tsx`**
  - Sidebar for all admin pages.
  - Items:
    - `/admin/operations` – Operations view.
    - `/admin/live-checkin` – Scanner UI.
    - `/admin/on-spot` – On-spot registration (superadmin/manager/editor only in UI).
    - `/admin/passes` – Pass explorer.
    - `/admin/teams` – Teams.
    - `/admin/users` – Users.
    - `/admin/registrations` – Registrations (sidebar visibility gated to manager/superadmin roles; route itself further protected in `AdminPanelShell`).

**Unified / Financial / Operations (TanStack-based analytics tables)**
- **`app/admin/unified/page.tsx` → `app/admin/unified/UnifiedViewClient.tsx`**
  - Unified operational view, no financial fields.
  - Data:
    - `GET /api/admin/events?activeOnly=1`
    - `GET /api/admin/unified-dashboard?mode=operations&pageSize=50&cursor=...&passType=&eventId=&eventCategory=&eventType=&from=&to=&q=...`
  - Components:
    - `components/admin/UnifiedTable.tsx` – TanStack table with:
      - Grouping (by passType, event, college).
      - Filters: `q`, `passType`, `eventId`, `eventCategory`, `eventType`, `from`, `to`.
      - Cursor-based pagination via `nextCursor` and `canPrev`.
      - Row selection with `BulkActionBar`.
    - `components/admin/BulkActionBar.tsx` – Bulk pass/payment actions (see RBAC audit).
    - `components/admin/RowDetailModal.tsx` – Per-pass drawer with mark-used, revert, fix-payment, QR, delete.

- **`app/admin/operations/page.tsx` → `app/admin/operations/OperationsClient.tsx`**
  - Operations view (success-only operational table).
  - Data:
    - Same `GET /api/admin/events?activeOnly=1`.
    - `GET /api/admin/unified-dashboard?mode=operations&...` (filters + cursor-based pagination).
  - Internal table (no TanStack) but similar behavior:
    - Filters: search, passType, eventId, eventCategory, eventType, from, to.
    - Row selection + `BulkActionBar`.
    - Row detail via `RowDetailModal` (through `toCleanRecord` mapping).
  - Additional UI:
    - **Superadmin role assignment** block:
      - Uses `POST /api/admin/assign-role` to set `users/{uid}.adminRole` (`viewer|manager|superadmin`) and `isOrganizer: true`.

- **Financial view**
  - Financial table component: `components/admin/FinancialTable.tsx`.
  - Admin docs and route map indicate **page** `app/admin/financial/page.tsx` → `FinancialViewClient` which uses:
    - `GET /api/admin/events?activeOnly=1`
    - `GET /api/admin/unified-dashboard?mode=financial&...`
  - Table:
    - Columns: name, college, phone, email, event, passType, amount, paymentStatus, orderId, createdAt.
    - Filters: same `UnifiedTableFilters`.
    - Pagination: cursor-based via `nextCursor`.
  - Bulk operations:
    - `BulkActionBar` with `financialMode=true` enabling **Force verify** (`forceVerifyPayment` bulk action on payments).

**Passes & teams**
- **`app/admin/passes/page.tsx`**
  - New “Passes” explorer.
  - Data: `GET /api/admin/passes?type=<type|all>&page=&pageSize=50`.
  - Uses `AdminPassRow` / `AdminPassesResponse`.
  - Filters: passType (all/day_pass/group_events/proshow/sana_concert), search, event label, page; client-side filtering on loaded page.
  - Pagination: server-side page-based but via `AdminPassesPagination` (`page`, `pageSize`, `hasMore`).

- **`app/admin/teams/page.tsx`**
  - Teams list and expanded members (group_events).
  - Data:
    - `GET /api/admin/teams` (custom aggregate building `records[].team`).
    - `GET /api/admin/teams/[teamId]` for detail.
    - `GET /api/admin/export/teams` for CSV export.
    - `POST /api/admin/update-team` for archive/edit/reset.
    - `PATCH /api/admin/passes/[passId]` for “Revert Pass Usage”.
    - `DELETE /api/admin/teams/[teamId]` for delete.
  - Displays:
    - Team name, leader, phone, eventName, members, paymentStatus, attendance bar.
    - Expanded nested member rows with `attendance.checkedIn` / `checkInTime` / `checkedInBy`.

**Users**
- **`app/admin/users/page.tsx`**
  - Users list and edit sheet.
  - Data:
    - `useUsers` → paginated `GET /api/users?pageSize=500&cursor=...` until either `MAX_PAGES=20` or no `nextCursor`.
    - Mutations: `POST /api/admin/update-user`.
  - UI:
    - Columns: name, email, college, phone, role (Organizer/User), invites, createdAt.
    - Edit: name, phone, college, `isOrganizer` checkbox.

**Registrations (on-spot and manual)**
- **`app/admin/registrations/page.tsx`**
  - Pending registrations list with status changes and on-spot payment flows.
  - Data:
    - `useRegistrations(user)` → `GET /api/admin/registrations?page=&pageSize=&q=&passType=&from=&to=`.
  - Mutations:
    - Status change:
      - `POST /api/admin/update-registration-status` (only for non-`converted` statuses).
    - Payment conversions:
      - `POST /api/admin/process-cash-payment` (cash, superadmin).
      - `POST /api/payment/create-order` + `POST /api/payment/verify` (UPI/Cashfree link).

- **`app/admin/registrations/manual/page.tsx`**
  - “Manual Registration” with Cashfree checkout (manager/superadmin only in UI).
  - Data:
    - `POST /api/admin/create-registration-order` → Cashfree order/session.
  - Cashfree JS SDK used client-side (`@cashfreepayments/cashfree-js`) with `paymentSessionId`.
  - After redirect, page reads `order_id` query param to show success hint.

- **`app/admin/on-spot/page.tsx`**
  - On-spot registrations + local activity feed.
  - Data:
    - `GET /api/admin/events?activeOnly=1` for event list and conflict mapping.
    - `POST /api/admin/onspot/create-order` → Cashfree order and `payment_session_id`.
    - `POST /api/admin/onspot/verify` → triggers `/api/fix-stuck-payment` and updates `onspot_student_registrations`.
  - Enforces event conflict rules purely client-side via `getAllConflicts`.

**Scanning / check-in**
- **`app/admin/live-checkin/page.tsx`**
  - Scanner UI for QR verification (keyboard / scanner input).
  - Data:
    - `POST /api/admin/scan-verify` (with token or raw JSON).
  - Provides:
    - Color-coded backgrounds and beeps for valid/invalid/already-used.
    - Shows name, passType, teamName, memberCount.
    - Auto-reset after 3 seconds.

**Event dashboards**
- **`app/admin/events/[eventId]/page.tsx`**
  - Event-specific dashboard.
  - Data:
    - `GET /api/admin/events/[eventId]` – event + metrics.
    - `GET /api/admin/unified-dashboard?eventId=...&pageSize=500` – unified records for the event.
    - `GET /api/admin/events/[eventId]/export` – CSV export.

### 2.2 Hooks

- **`features/auth/AuthContext.tsx`**
  - Global auth context; fetches `/api/me` with ID token to populate `userData` including `isOrganizer` and `adminRole`.

- **`hooks/use-me-role.ts`**
  - Fetches `adminRole` from `/api/me` with token refresh on 401.
  - On persistent errors: signs out and redirects via `onUnauthorized`.

- **`hooks/use-registrations.ts`**
  - Calls `GET /api/admin/registrations` with page, pageSize, filters.
  - Cursorless (offset-based) pagination; caches initial unfiltered page in `lib/clientCache`.

- **`hooks/use-audit-logs.ts`**
  - Calls `GET /api/admin/logs?limit=100`.

- **`hooks/use-users.ts`**
  - Paginates through `GET /api/users?pageSize=500&cursor=...` up to 20 pages (10,000 users).

### 2.3 Backend Admin APIs (`/api/admin/**`)

**Core auth/rate limiting**
- **`lib/admin/requireOrganizer.ts`**
  - Reads `Authorization: Bearer <idToken>`, verifies via Firebase Admin.
  - Fetches `users/{uid}`, checks `isOrganizer === true` **OR** `adminRole ∈ {editor,manager,superadmin}`.
  - Returns `{ uid }` or 401/403 JSON.
- **`lib/admin/requireAdminRole.ts`**
  - Wraps `requireOrganizer`, fetches `users/{uid}.adminRole`, normalizes via `parseRole`.
  - Returns `{ uid, adminRole }` with helpers:
    - `canMutatePasses(role)` (manager, superadmin).
    - `canMutateTeams(role)` (manager, superadmin).
    - `canMutateUsersPaymentsEvents(role)` (superadmin).
- **`lib/security/adminRateLimiter.ts` + `middleware.ts`**
  - Distributed sliding-window rate limiting via Upstash Redis, per category (scan, bulk, export, mutation, search, dashboard).
  - Middleware covers `/api/admin/:path*`, `/api/passes/scan`, `/api/passes/scan-member` (rate-limiting only; auth is in handlers).

**Unified and analytics**
- **`app/api/admin/unified-dashboard/route.ts`**
  - `GET`:
    - Auth: `requireAdminRole` (financial mode requires `adminRole === 'superadmin'`).
    - Rate limit: `dashboard` or `export` when `format=csv`.
    - Pass query:
      - **Intentional no-Firestore filters** to avoid composite index requirements.
      - `db.collection('passes').limit(2000)` followed by **in-memory filtering** on `passType`, `selectedEvents`/`eventIds`, `eventCategory`, `eventType`, `createdAt` range.
      - In-memory sort by `createdAt desc`.
      - Page-based slicing: `(page-1)*pageSize ... page*pageSize`.
    - Joins:
      - Users (`users/{userId}`), Payments (`payments/{paymentId}`), Events (`events/{eventId}`).
    - Filters:
      - Only payments with `status === 'success'` retained.
      - Optional text search `q` on `name + email`.
    - Responses:
      - `mode=operations` → `OperationsDashboardResponse` (no amount or orderId).
      - `mode=financial` → `FinancialDashboardResponse` with `summary.totalRevenue` computed by scanning up to 10,000 passes and aggregating joined successful payments.
    - CSV outputs for both modes.

**Passes / teams / users / payments**
- **`app/api/admin/passes/route.ts`**
  - `GET /api/admin/passes?type=<PassType|all>&page=&pageSize=&...` (new Admin Passes API).
  - Auth: `requireOrganizer`.
  - Rate limit: `dashboard`.
  - Query:
    - `passes` collection, optional `where('passType','==',type)` (else all types).
    - Limit 1000, in-memory filter `isArchived !== true`.
    - Sort in-memory by `createdAt desc`.
  - Joins: `users`, `payments`, `teams`.
  - `AdminPassRow`:
    - `id`, `userId`, `name`, `phone`, `college`, `passType`, derived `eventLabel` / `selectedDay`, `amount`, `paymentStatus: 'success'`, `isUsed` (`scannedCount>0`), `usedAt`, `createdAt`.
  - Summary (`AdminPassesSummary`): `totalSold`, `totalRevenue`, `totalUsed`, `usagePercentage`.

- **`app/api/admin/teams/route.ts`**
  - `GET /api/admin/teams`:
    - Auth: `requireOrganizer`.
    - Rate limit: `dashboard`.
    - Finds `passes` with `passType == 'group_events'`, then unique `teamId`s.
    - Fetches `teams/{teamId}` in batches.
    - Resolves event name from pass data and, as fallback, `payments` data.
    - Returns `records[]` in shape expected by `/admin/teams` UI: `record.team` plus `eventName` and `passId`.

- **`app/api/admin/teams/[teamId]/route.ts`**
  - `GET`:
    - Auth: `requireOrganizer`.
    - Returns single team with `members` (flattened `attendance.checkedIn`) and `paymentStatus`.
  - `DELETE`:
    - Auth: `requireAdminRole` + `canMutateTeams`.
    - Deletes the team document (does **not** touch linked passes/payments).

- **`app/api/admin/update-team/route.ts`**
  - `POST`:
    - Auth: `requireAdminRole` + `canMutateTeams`.
    - Mutations:
      - `teamName`, `members`, `resetAttendance`, `removeMemberId`, `isArchived`.
    - Writes audit log with sanitized `previousData`/`newData`.

- **`app/api/users/route.ts`**
  - `GET /api/users?cursor=&pageSize=&includeArchived=1`:
    - Auth: `requireOrganizer`.
    - Rate limit: (none via `rateLimitAdmin`, but still behind `requireOrganizer`).
    - Query: `users.orderBy('createdAt','desc').limit(pageSize)`, optional `startAfter(cursorDoc)`.
    - In-memory `isArchived` filtering.
    - Returns `{ users, count, nextCursor }`.

- **`app/api/payments/route.ts`**
  - `GET /api/payments?...`:
    - Auth: `requireOrganizer`.
    - Rate limit: `dashboard`.
    - Query: `payments.orderBy('createdAt','desc').limit(pageSize)`, optional cursor.
    - In-memory filters:
      - `includeArchived`, `eventId` (via `getEventIdsFromPayment`), `eventCategory`, `eventType`.
    - Joins `users` to inject `name`/`email`.
    - Returns canonical `status` from `payments.status` only.

- **`app/api/passes/route.ts`**
  - `GET /api/passes?...` (flat pass list; not used by main admin UIs any more, but still present).
  - Auth: `requireOrganizer`.
  - Rate limit: none via `rateLimitAdmin`.
  - Query: `passes.orderBy('createdAt','desc').limit(pageSize)` with cursor.
  - In-memory `isArchived` filter.

**Dashboard & stats**
- **`app/api/dashboard/route.ts`**
  - `GET /api/dashboard?...`:
    - Auth: `requireOrganizer`.
    - Rate limit: `dashboard`.
    - Query: `admin_dashboard` collection with optional single filter (`college`, `passType`, `paymentStatus`, `eventId`, `eventCategory`, `eventType`).
    - Cursor-based pagination.

- **`app/api/stats/route.ts`**
  - `GET /api/stats`:
    - Auth: `requireOrganizer`.
    - Uses aggregation queries and batched reads:
      - `users.count()`, `teams.count()`.
      - `payments.where(status=='success').orderBy(createdAt).limit(1000)`.
      - `payments.where(status=='pending').count()`.
      - `passes.where(status=='paid').count()`, `passes.where(status=='used').count()`.
      - Per-pass-type counts via `passes.where(passType=='X').where(isArchived==false).limit(1000)` intersected with a map of successful payments.
    - Computes:
      - `OverviewStats` and `ActivityFeedItem[]` (recent payments, scans, teams).

**Registrations & on-spot**
- **`app/api/admin/registrations/route.ts`**
  - `GET`:
    - Auth: `requireOrganizer`.
    - Rate limit: `dashboard`.
    - Query:
      - `registrations.where(status=='pending').orderBy(createdAt,'desc')`.
      - Optional `where(passType == passType)` and `createdAt` range.
      - Offset-based pagination (`offset(page-1)*pageSize`).
    - In-memory search by `q` over `name/email/phone`.
    - Uses `count()` aggregation for approximate `total` / `totalPages`.

- **`app/api/admin/update-registration-status/route.ts`**
  - `POST`:
    - Auth: `requireAdminRole`.
    - Roles: only `manager` and `superadmin` allowed.
    - Updates `registrations/{id}` status and logs via `admin_logs`.

- **`app/api/admin/create-registration-order/route.ts`**
  - `POST`:
    - Auth: `requireAdminRole`.
    - Roles: `manager` and `superadmin`.
    - Uses `PASS_PRICES` map and Cashfree `orders` API.
    - Writes `payments/{orderId}` with `status: 'pending'`, `isManualRegistration: true`, and `customerDetails`.
    - Returns `orderId` and `paymentSessionId`.

- **`app/api/admin/process-cash-payment/route.ts`**
  - `POST`:
    - Auth: `requireAdminRole`.
    - Roles: `canMutateUsersPaymentsEvents` (superadmin).
    - Flow:
      - Validates `registrations/{registrationId}` is `pending`.
      - Creates `payments/{paymentId}` with `status: 'success'`, `source: 'admin-dashboard-cash'`.
      - Creates `passes/{passId}` with QR via `createQRPayload` + `QRCode.toDataURL`.
      - Updates registration to `converted` with links to payment/pass.
      - Logs to `admin_logs` and calls `rebuildAdminDashboardForUser(userId)`.

- **`app/api/admin/onspot/create-order/route.ts`**
  - `POST`:
    - Auth: `requireAdminRole`.
    - Roles: `manager`, `editor`, `superadmin`.
    - Flow:
      - Resolves/creates `users/{uid}` for provided email.
      - Writes `onspot_student_registrations/{orderId}` with status `pending`.
      - Calls Cashfree `orders` API and returns `payment_session_id`.

- **`app/api/admin/onspot/verify/route.ts`**
  - `POST`:
    - Auth: `requireAdminRole`.
    - Roles: `manager`, `editor`, `superadmin`.
    - Calls `/api/fix-stuck-payment` with same Authorization header to ensure Cashfree PAID → payment/pass creation.
    - Updates `onspot_student_registrations/{orderId}.status = 'success'`.

**Pass mutation & QR**
- **`app/api/admin/update-pass/route.ts`**
  - `POST`:
    - Auth: `requireAdminRole` + `canMutatePasses`.
    - Mutations: `status` (paid/used + usedAt/scannedBy), `selectedEvents`, `teamId`, `regenerateQr`, `isArchived`.
    - Uses `createQRPayload` + `QRCode.toDataURL` when regenerating QR.

- **`app/api/admin/passes/[passId]/route.ts`**
  - `PATCH`:
    - Auth: `requireAdminRole` + `canMutatePasses`.
    - Body `{ action: 'markUsed' | 'revertUsed' }`.
    - Transitions status and logs to `admin_logs`.
  - `DELETE`:
    - Auth: `requireAdminRole` + `canMutatePasses`.
    - Hard deletes pass and logs via `admin_logs`.

- **`app/api/admin/passes/[passId]/qr/route.ts`**
  - `GET`:
    - Auth: `requireOrganizer`.
    - Regenerates a **fresh** QR code data URL using `createQRPayload` and returns it (does not store it back).

- **`app/api/admin/passes/[passId]/fix-payment/route.ts`**
  - `POST`:
    - Auth: `requireOrganizer`.
    - Reads `paymentId` from pass and calls `/api/fix-stuck-payment` to reconcile with Cashfree and create pass if missing.

**Bulk operations**
- **`app/api/admin/bulk-action/route.ts`**
  - `POST`:
    - Auth: `requireAdminRole`.
    - Rate limit: `bulk`.
    - Actions:
      - On `passes`: `markUsed`, `revertUsed`, `softDelete` (archive), `delete`.
      - On `payments`: `forceVerifyPayment`, `delete`, `softDelete`.
      - On `events`: `activateEvent`, `deactivateEvent`, `softDelete`.
      - On `teams` and `users`: `softDelete`.
    - **RBAC behavior**:
      - `allowWithoutRoleCheck` for:
        - Pass mutations (`markUsed`, `revertUsed`, `softDelete`, `delete`).
        - Team `softDelete`.
      - Payment deletes and `forceVerifyPayment` require `canMutateUsersPaymentsEvents` (superadmin).
      - Event actions require `canMutateUsersPaymentsEvents`.
    - For each id:
      - Reads doc, applies updates or delete, writes `admin_logs`.

**Logs and roles**
- **`app/api/admin/logs/route.ts`**
  - `GET`:
    - Auth: `requireAdminRole`.
    - Rate limit: `dashboard`.
    - `admin_logs.orderBy('timestamp','desc').limit(limit)`.

- **`app/api/admin/assign-role/route.ts`**
  - `POST`:
    - Auth: `requireAdminRole`.
    - Roles: `superadmin` only.
    - Resolves user by email via Firebase Auth, falling back to Firestore `users` query.
    - Upserts `users/{uid}` with `adminRole` and `isOrganizer: true`.
    - Logs to `admin_logs`.

**Scan verify**
- **`app/api/admin/scan-verify/route.ts`**
  - `POST`:
    - Auth: `requireOrganizer`.
    - Rate limit: `scan`.
    - Parses `token` from JSON body, uses `verifySignedQR` (`QR_SECRET_KEY` based).
    - Reads `passes/{passId}` and optionally `users/{userId}` to return `valid` / `already_used` / `invalid`.
    - Does **not** mutate pass status (verification-only).

**Other non-`/api/admin` but admin-only APIs**
- **`app/api/me/route.ts`**
  - `GET`: Auth via `requireOrganizer`, returns `uid`, `email`, `name`, `isOrganizer: true`, `adminRole`.
- **`app/api/fix-stuck-payment/route.ts`**
  - `POST`: Auth via `requireOrganizer`, rate-limit 3/60s via `checkRateLimit`.
  - See Section 4 for payment idempotency.
- **`app/api/payment/create-order/route.ts`** and **`app/api/payment/verify/route.ts`**
  - Legacy/manual flows for registrations (non-`/admin` prefix) that still rely on `requireOrganizer` and call `fix-stuck-payment` internally.

## 3. RBAC & Authorization Audit

### 3.1 Role Determination and Trust Boundaries

- **Server-side role source**
  - All privileged APIs use:
    - `requireOrganizer` to validate ID token and enforce `users/{uid}.isOrganizer === true` **or** recognized `adminRole`.
    - `requireAdminRole` to additionally read `users/{uid}.adminRole ∈ {viewer,manager,superadmin}`.
  - Frontend **never** trusts local flags alone: `AuthContext` calls `/api/me` with the ID token, then `AdminPanelShell` uses `userData.isOrganizer` and `useMeRole` to gate views.

- **Frontend access gating**
  - `AdminPanelShell`:
    - **Hard gate**: Redirects to `/signin` when `!user` or `!userData?.isOrganizer`, so non-organizers never see admin routes.
    - Additional check: registrations pages require `adminRole` ∈ {manager, superadmin} (front-end only; backend also enforces).
  - `ManualRegistrationPage` and `OnSpotRegistrationPage`:
    - Gate access by `userData.adminRole` in UI; but server relies on `requireAdminRole`, so UI is conservative relative to backend.

**Assessment**: **🟢 Correct** – Role/organizer flags are derived solely from server-side `/api/me` and Firebase Admin; frontend hides controls but does not bypass API checks.

### 3.2 Backend Role Enforcement Coverage

- **Read endpoints**
  - All `/api/admin/*` reads use either `requireOrganizer` (for organizer-level reads, e.g. teams, events, registrations, passes) or `requireAdminRole` (for unified dashboards, logs).
  - Non-admin routes like `/api/users`, `/api/payments`, `/api/passes`, `/api/dashboard`, `/api/stats` all use `requireOrganizer`.

- **Mutation endpoints and role matrices**
  - **Pass mutations**
    - `POST /api/admin/update-pass` – `requireAdminRole` + `canMutatePasses` (manager, superadmin).
    - `PATCH/DELETE /api/admin/passes/[passId]` – `requireAdminRole` + `canMutatePasses`.
    - `POST /api/admin/passes/[passId]/fix-payment` – `requireOrganizer` only (no role gating) by design to let any organizer run fix-stuck flow.
  - **Team mutations**
    - `POST /api/admin/update-team` – `requireAdminRole` + `canMutateTeams`.
    - `DELETE /api/admin/teams/[teamId]` – `requireAdminRole` + `canMutateTeams`.
  - **User/payment/event mutations**
    - `POST /api/admin/update-user` – `requireAdminRole` + `canMutateUsersPaymentsEvents` (superadmin only).
    - `POST /api/admin/update-payment` – same (superadmin only).
    - `POST /api/admin/update-event` – same (superadmin only).
  - **Registrations**
    - `POST /api/admin/update-registration-status` – `requireAdminRole` and enforces `adminRole ∈ {manager, superadmin}`.
    - `POST /api/admin/process-cash-payment` – `requireAdminRole` + `canMutateUsersPaymentsEvents` (superadmin).
  - **Bulk mutations**
    - `POST /api/admin/bulk-action` – `requireAdminRole` always; see gap below.
  - **Role assignment**
    - `POST /api/admin/assign-role` – `requireAdminRole` and enforces `adminRole === 'superadmin'` explicitly.

**Assessment**: For most mutations, role checks align with design docs (**🟢 Correct**), with one notable exception in bulk actions.

### 3.3 Critical RBAC Gap: Bulk Pass/Team Mutations

- **Behavior**
  - In `app/api/admin/bulk-action/route.ts`:
    - For `targetCollection === 'passes'` and actions `markUsed`, `revertUsed`, `softDelete`, `delete`, as well as `softDelete` on `teams`, the code sets `allowWithoutRoleCheck = true`.
    - This bypasses all `canMutate*` helper checks, effectively allowing **any organizer** who can pass `requireAdminRole` (including `viewer`) to bulk mutate passes and soft-delete teams.
  - UI:
    - `BulkActionBar` in `UnifiedViewClient` and `OperationsClient` is rendered unconditionally for any authenticated organizer; it does **not** inspect `adminRole`.

- **Impact**
  - A nominally read-only **viewer** can, via the unified or operations views:
    - Bulk **mark passes as used**.
    - Bulk **revert used passes to paid**.
    - Bulk **archive passes** (`softDelete`).
    - Bulk **hard-delete passes** (`delete`).
    - **Soft-delete teams**.
  - All these actions are high-blast-radius and affect door control (pass usage) and auditability.
  - While `admin_logs` records these actions, they can be triggered accidentally or maliciously by roles that the docs state are read-only.

- **Why this is dangerous**
  - Violates the documented capability matrix in `docs/AUTH_AND_ROLES.md` where `viewer` is read-only and `manager` handles passes/teams.
  - Bypasses the otherwise consistent role controls on `update-pass`, `update-team`, and `passes/[passId]` endpoints.
  - Given this system controls entry (pass scanning) and financial reconciliation, bulk deletions or misuse can corrupt operational state mid-event.

**Assessment**: **🔴 Critical RBAC gap** – `POST /api/admin/bulk-action` allows viewers to perform destructive pass and team operations.  
**Recommendation** (must-fix before production):
- Require `canMutatePasses` / `canMutateTeams` for all pass/team actions, even in bulk:
  - Remove `allowWithoutRoleCheck`, or gate it behind `canMutatePasses` / `canMutateTeams`.
- On the frontend, hide or disable `BulkActionBar` unless `adminRole ∈ {manager, superadmin}` (and for payment bulk actions, `superadmin` only).

### 3.4 Other RBAC Observations

- **Fix-stuck-payment access (`/api/fix-stuck-payment`, `/api/admin/passes/[passId]/fix-payment`, `/api/admin/onspot/verify`)**
  - Intentionally accessible to **any organizer** (via `requireOrganizer` or `requireAdminRole` without capability helpers).
  - Given the route always verifies Cashfree `order_status === 'PAID'` and is idempotent, allowing broader access is acceptable and consistent with docs (“organizers can trigger fix-stuck-payment”).
  - **Assessment**: **🟢 Correct implementation** for the documented threat model.

- **Organizer vs adminRole in `requireOrganizer`**
  - `requireOrganizer` allows either `isOrganizer === true` **or** having a recognized `adminRole`, whereas docs emphasize `isOrganizer` as the primary gate.
  - However, `assign-role` always sets both `isOrganizer: true` and `adminRole`, and `/api/me` reports `isOrganizer: true` for organizers, so legitimate admins are consistently flagged.
  - Residual risk exists if stale data has `adminRole` but `isOrganizer: false`; such users could hit APIs but would be redirected away from the admin UI by `AdminPanelShell`. This is more of a schema hygiene point than an exploitable bug.
  - **Assessment**: **🟡 Weak consistency**, but low operational risk if data migrations keep `isOrganizer` in sync with `adminRole`.

## 4. Financial & Payment Integrity Audit

### 4.1 Payment Visibility and Filtering

- **Unified / Financial views**
  - `/api/admin/unified-dashboard`:
    - After joining passes to payments, **only** records where `payment.status === 'success'` are retained.
    - Operations mode omits amount and `orderId`; financial mode includes them.
  - Components (`UnifiedTable`, `FinancialTable`, `OperationsClient`) assume unified data is success-only, and they do not add any client-side “paid” heuristics.
  - **Assessment**: **🟢 Correct** – unified/financial views never display failed or pending payments as if they were confirmed.

- **Payments list (`/admin/payments`)**
  - `/api/payments` surfaces all payments regardless of status; status column is directly derived from `payments.status`.
  - UI (`app/admin/payments/page.tsx`, per docs) uses that status to filter and format; no re-interpretation of status.
  - **Assessment**: **🟢 Correct** – payments list reflects canonical status; does not blur pending vs success.

- **Passes views vs payment success**
  - New passes API (`/api/admin/passes`):
    - Constructs rows from passes that are not `isArchived`, but does **not** re-check `payment.status === 'success'`.
    - However, passes are only created in flows that verify payment status (main app or `fix-stuck-payment` / `process-cash-payment`), so a pass is conceptually synonymous with “payment completed”.
  - Legacy pass management route (documented in `docs/ADMIN_PASSES_API.md`) does apply `payment.status === 'success'` filtering when deriving `PassManagementRecord`.
  - **Assessment**: **🟡 Acceptable** given current flows, but error-prone if future code ever creates passes for non-success payments.
    - If resilience is desired, consider explicitly verifying `payment.status === 'success'` before including a pass row even in the AdminPasses API.

### 4.2 Idempotent Pass Creation & Fix-Stuck Workflow

- **`/api/fix-stuck-payment`** (`app/api/fix-stuck-payment/route.ts`)
  - Auth: `requireOrganizer` + 3/60s rate limit.
  - Flow:
    1. Validates `orderId` presence.
    2. Calls Cashfree `GET /orders/{orderId}` with configured credentials.
    3. If status is not `PAID`, returns 400 and **does not** touch Firestore.
    4. Looks up payment in `payments.where(cashfreeOrderId == orderId)` or `onspotPayments` fallback.
    5. If not found, returns 404.
    6. If payment status is not `success`, updates it to `success`, `updatedAt`, `fixedManually: true`.
    7. Checks for existing pass via `passes.where(paymentId == orderId)`:
       - If pass exists, rebuilds `admin_dashboard` and returns success (idempotent).
       - If no pass exists:
         - Resolves eventIds and metadata either from `payment.eventIds` or via `events.where(allowedPassTypes array-contains passType)`.
         - Creates a new `passes/{passId}` with:
           - `paymentId: orderId`, `status: 'paid'`, QR from `createQRPayload(passId,userId,passType)`.
           - Event metadata, and for `group_events` with `teamId`, a `teamSnapshot` and team `paymentStatus: 'success'` update.
         - Updates `payment.eventIds`/`eventCategory`/`eventType` if missing.
         - Rebuilds `admin_dashboard` for `userId`.
         - Optionally sends pass confirmation email with PDF via Resend.
  - **Idempotency**:
    - Repeated calls for a `PAID` order that already has a pass will **not** create duplicates; they detect existing passes.
    - Cashfree `order_status === 'PAID'` is the single source of truth; Firestore is reconciled to Cashfree, not vice versa.
  - **Assessment**: **🟢 Correct, idempotent** – robust reconciliation; no multi-pass issuance per paid order.

- **`/api/admin/passes/[passId]/fix-payment`** and **`/api/admin/onspot/verify`**
  - Both act as proxies to `/api/fix-stuck-payment`, reusing the exact idempotent logic.
  - `passes/[passId]/fix-payment` derives `orderId` from `pass.paymentId`, while `onspot/verify` works with an explicit `orderId` and updates `onspot_student_registrations`.
  - **Assessment**: **🟢 Correct reuse** – no duplicated or diverging business logic.

- **Potential edge cases**
  - `passes.where(paymentId == orderId)` assumes `paymentId` stores the Cashfree order id; elsewhere `paymentId` is the Firestore doc id. The schema doc acknowledges this dual meaning.
  - The code preserves and backfills `payment.eventIds` from pass data when necessary, reducing drift.
  - **Assessment**: **🟡 Slight schema fragility**, but mitigated by explicit backfills and consistent use in core flows.

### 4.3 Cash and On-Spot Flows

- **Cash payments (`/api/admin/process-cash-payment`)**
  - Amount comes from `registrations.calculatedAmount` or `amount`, not from the client.
  - Creates a `success` payment and a pass, then converts registration to `converted`.
  - Builds dashboard and logs every step.
  - **Assessment**: **🟢 Safe** – no client-controlled amount; pass creation and registration state updates are atomic from the perspective of the admin app.

- **On-spot flows (`/api/admin/onspot/create-order` + `/api/admin/onspot/verify`)**
  - Amounts are determined by a server-side `PASS_PRICES` table and not from the client.
  - All verification is delegated to `/api/fix-stuck-payment`, which consults Cashfree.
  - **Assessment**: **🟢 Safe** – amounts and statuses derive from server constants and Cashfree; no client-side totals used as source of truth.

### 4.4 Client-Side Computations

- No admin view computes financial **truth** client-side:
  - Stats, revenue, and totals are computed in `/api/stats`, `/api/admin/unified-dashboard`, and `/api/admin/passes`.
  - UI components display server-provided metrics and occasionally filter/sort them, but never re-derive canonical payment success or totals from partial pages.
  - **Assessment**: **🟢 Correct** – no reliance on client-side aggregation for authoritative financial metrics.

## 5. Firestore Query & Index Analysis

### 5.1 Unified Dashboard (`/api/admin/unified-dashboard`)

- **Collections**: `passes`, `payments`, `users`, `events`.
- **Filters**:
  - In-memory on `passType`, `eventId` (via `selectedEvents`/`eventIds`), `eventCategory`, `eventType`, `createdAt` range, `q` (name/email).
- **Sort**: In-memory by `createdAt desc`.
- **Pagination**:
  - Pass query fetches up to 2000 docs, then slices by `(page, pageSize)`; `nextCursor` is derived from last doc in the sliced page.
- **Composite index needs**:
  - None at query level; the code explicitly **avoids** Firestore `where + orderBy` combinations to suppress index requirements.
- **Risks**:
  - For datasets > 2000 passes:
    - Older passes will **never appear** in any page, even when filters would otherwise narrow to them.
    - `summary.totalRevenue` scans up to 10,000 passes and may undercount if more passes exist.
- **Flag**: **🟡 Missing pagination / partial scans** – bounded by 2000/10000 but not truly scalable; results can be misleading at higher volumes.

### 5.2 Admin Passes (`/api/admin/passes`)

- **Collections**: `passes`, `users`, `payments`, `teams`.
- **Filters**:
  - Firestore: optional `passType == type`, `isArchived != true` (in-memory).
  - The new API no longer filters by `payment.status` (relies on pass presence as proxy for payment success).
- **Sort**:
  - In-memory by `createdAt desc`.
- **Pagination**:
  - Server returns full current batch (up to 1000 passes) with `pagination.hasMore` and page slicing done server-side for `AdminPassesResponse`.
- **Risks**:
  - Up to 1000-pass batch per request with joins; acceptable for current scale but will become heavy under larger loads.
- **Flag**: **🟡 Mildly heavy joins**, but no unbounded scan.

### 5.3 Registrations (`/api/admin/registrations`)

- **Collection**: `registrations`.
- **Filters**:
  - Firestore: `status == 'pending'`, optional `passType ==`, `createdAt` between from/to.
  - In-memory: `q` search across `name/email/phone`, plus a safeguards pass on dates.
- **Sort**: `orderBy('createdAt','desc')`.
- **Pagination**:
  - Offset-based (`offset((page-1)*pageSize)`).
- **Risks**:
  - Offset pagination cost grows linearly with page; for moderate admin volumes this is acceptable, but for very large registration counts it will become expensive.
- **Flag**: **🟡 Missing cursor-based pagination** – not a correctness bug but a scalability concern.

### 5.4 Teams (`/api/admin/teams` and `/api/admin/teams/[teamId]`)

- **Collections**: `passes`, `teams`, `payments`.
- **Filters**:
  - Pass query: `passType == 'group_events'` (no additional filters).
  - Unique `teamId`s extracted and used to fetch `teams/{id}`.
  - For missing event names, additional lookups into `payments`.
- **Sort**:
  - In-memory; not sorted for teams beyond iterated order.
- **Pagination**:
  - None – limited by `limit(1000)` passes and `teamIds` cardinality.
- **Risks**:
  - Bounded at 1000 passes; acceptable for event scale, but no pagination means “teams” view is effectively a full sample of group events.
- **Flag**: **🟡 Missing pagination**, but explicit hard caps prevent unbounded scans.

### 5.5 Users (`/api/users`), Payments (`/api/payments`), Passes (`/api/passes`), Dashboard (`/api/dashboard`), Stats

Summarizing from implementation and `docs/ADMIN_FIRESTORE_USAGE.md`:

- **Users (`/api/users`)**
  - Query: `users.orderBy('createdAt','desc').limit(pageSize)` with cursor.
  - In-memory `isArchived` filter.
  - **Flag**: **🟢 Proper cursor-based pagination**; no unbounded scan.

- **Payments (`/api/payments`)**
  - Query: `payments.orderBy('createdAt','desc').limit(pageSize)` with cursor.
  - In-memory filters for archived and event fields.
  - **Flag**: **🟢 Cursor-based pagination**; cost controlled via pageSize.

- **Passes (`/api/passes`)**
  - Query: `passes.orderBy('createdAt','desc').limit(pageSize)` with cursor.
  - In-memory `isArchived` filtering.
  - **Flag**: **🟢 Cursor-based pagination**; collection-wide scans avoided.

- **Dashboard (`/api/dashboard`)**
  - Uses `admin_dashboard` with `orderBy(updatedAt,'desc')` and optional single `where` filter; cursor-based.
  - Indexes may be required for some compound filters, but the implementation matches the schema assumptions.
  - **Flag**: **🟢 Index-aligned**, given existing `firestore.indexes.json`.

- **Stats (`/api/stats`)**
  - Uses `count()` aggregations and limited queries instead of full collection scans.
  - Some queries (e.g. top-N pass distributions) use `limit(1000)`; partial but cost-bounded.
  - **Flag**: **🟡 Partial sampling for distributions**, acceptable but should be documented as approximate at scale.

### 5.6 Unbounded or Risky Queries

- No admin endpoint performs an outright **unbounded collection scan** without a hard limit:
  - Where full scans existed in older code, they have generally been replaced with `limit(N)` and/or `count()` aggregations.
  - The chief remaining concern is unified-dashboard’s `limit(2000/10000)` strategy, which is bounded but may not cover the entire dataset.

**Overall Query Flags**
- **🔴 Unbounded collection scans**: **0**
- **🟡 Missing pagination / partial reads**: 
  - Unified dashboard (bounded but partial).
  - Registrations (offset-based).
  - Teams (single 1000-pass batch, no paging).
- **🟢 Cursor-based pagination**: 
  - Users, payments, passes, admin_dashboard, logs, stats aggregation usage.

## 6. Performance & Scalability Analysis

### 6.1 Pagination and Data Fetching Strategy

- **Cursor-based pagination**
  - Implemented for `/api/users`, `/api/payments`, `/api/passes`, `/api/dashboard`, `/api/admin/logs`, and parts of unified-dashboard.
  - Reduces cost compared to offset-based approaches and is aligned with Firestore best practices.
  - **Assessment**: **🟢 Good practice**.

- **Offset-based pagination**
  - Used in `/api/admin/registrations`; may become expensive at large page numbers.
  - **Assessment**: **🟡 Acceptable for moderate scale**, but should be refactored to cursor-based if registrations volume grows.

- **Client caches**
  - `lib/clientCache.ts` used for initial unified dashboard and registrations page loads to avoid repeated API hits and rate-limit pressure.
  - Mutation handlers (e.g. `BulkActionBar`, `UnifiedViewClient`) call `invalidateCachePrefix('unified')` to ensure fresh re-fetches.
  - **Assessment**: **🟢 Good** – simple, safe caching with explicit invalidation.

### 6.2 Server vs Client-side Filtering

- **Unified dashboard & financial view**
  - Heavy filtering performed **in-memory** after fetching up to 2000 passes; server handles search, event filters, time windows.
  - Client only filters by selection/visibility and sorting within the already-filtered slice.
  - **Pros**: avoids index management at cost of higher Firestore reads per request.
  - **Cons**:
    - Increased latency under larger `passes` populations.
    - Partial dataset risk when more than 2000 qualifying passes exist.
  - **Assessment**: **🟡 Trade-off** – fine for current scale, but will be a bottleneck under high-volume usage; should move filters back into Firestore with composite indexes in the medium term.

- **Registrations / teams / passes**
  - Primary filtering done at query level (status, passType, createdAt).
  - Additional search and date safety checks done in-memory.
  - **Assessment**: **🟢 Balanced** – server-side for coarse filters, client/server for secondary filters.

### 6.3 N+1 Risks and Joins

- **Unified dashboard**:
  - Mitigates N+1 with batched joins:
    - Distinct `userIds`, `paymentIds`, `eventIds` → `Promise.all` for each group.
  - **Assessment**: **🟢 No N+1 within a page**, but still multi-collection cost per call.

- **Teams and passes APIs**
  - Similar pattern: gather IDs from passes and join to `users`, `payments`, `teams`, `events` in batched lookups.
  - **Assessment**: **🟢 Acceptable** – multi-collection but batched and capped.

### 6.4 Dashboard Initial Load and Hot Paths

- Initial admin load path:
  - `/` (overview) → `/api/stats` + optional `/api/dashboard`.
  - Sidebar → operations/unified views → `/api/admin/events`, `/api/admin/unified-dashboard`.
  - All of these are rate-limited (`dashboard` category) and use Firestore-friendly patterns (count, limit).
  - **Assessment**: **🟢 Reasonable** for expected admin concurrency; Firestore reads, not compute, will be the primary cost driver.

### 6.5 Real-time vs Static Fetches

- No real-time Firestore listeners (`onSnapshot`) are used; all admin data uses `fetch`-driven HTTP routes.
  - Reduces live-update responsiveness but is a cleaner fit for rate-limited, high-sensitivity admin data.
  - **Assessment**: **🟢 Appropriate** – real-time streaming would complicate rate limiting and auditing without strong benefit.

## 7. Security Findings

### 7.1 Endpoint Exposure and Infra-Only Protection

- No admin route relies solely on infra protection:
  - Every `/api/admin/**` handler begins with either `requireOrganizer` or `requireAdminRole`.
  - Edge middleware (`middleware.ts`) only does rate limiting; it does **not** perform authentication.
  - **Assessment**: **🟢 Admin endpoints are not infra-only; they enforce app-level auth.**

### 7.2 Secrets and Sensitive Data Exposure

- **Cashfree keys**
  - Strictly server-side (`CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`); never returned in JSON responses.
  - Errors from Cashfree are relayed as codes/messages, not secrets.

- **QR secrets**
  - QR payloads are created via `createQRPayload(passId,userId,passType)` using `QR_SECRET_KEY`.
  - Client only ever sees:
    - Signed token (in QR or as input).
    - Data URLs of rendered QR images.
  - `/api/admin/scan-verify` never returns raw secret; it uses `verifySignedQR` server-side and returns result classification only.

- **Audit logs**
  - `admin_logs` redact:
    - `amount`, `qrCode`, `token`, `signature`, `secret`, `password`, `cashfreeOrderId`, `paymentId`.
  - `GET /api/admin/logs` returns sanitized data to admins.

**Assessment**: **🟢 No evidence of secrets (API keys, QR HMAC keys, raw Cashfree payloads) being exposed to the client.**

### 7.3 Payment Reconciliation Access

- `fix-stuck-payment` and proxies are accessible to any organizer, not only superadmins.
  - However, since they only ever create passes when Cashfree reports `order_status === 'PAID'`, and are idempotent, this does not allow “faking” a payment; at worst, an organizer can re-trigger a legitimate reconciliation.
  - **Assessment**: **🟢 Safe** – reconciliations are constrained by third-party payment status, not client flags.

### 7.4 Firestore Rules Alignment

- The admin app uses Firebase Admin SDK exclusively; Firestore rules are not consulted.
  - This is acceptable because:
    - All Firestore reads and writes are wrapped in application-level auth/role checks.
    - No client SDK calls (`getFirestore` from client is only for non-admin features; admin tables do not use it).
  - Risk is concentrated in application-layer RBAC correctness (see Bulk actions gap).

**Summary of Security Flags**
- **🔴 Critical**:
  - Bulk pass/team mutations accessible to viewer roles via `/api/admin/bulk-action`.
- **🟡 Weak enforcement / nuanced risks**:
  - `requireOrganizer` accepts `adminRole` without requiring `isOrganizer: true` (mitigated by assign-role behavior).
  - Unified-dashboard partial scanning can lead to underreported financial metrics at very large scale.
- **🟢 Safe patterns**:
  - Payment secrets, QR secrets, and audit logs are handled appropriately.
  - All admin endpoints enforce token-based auth; no infra-only admin APIs.

## 8. UI/UX Operational Safety Audit

### 8.1 Column, Status, and Formatting Consistency

- **Columns**
  - Users, payments, passes, teams, unified, and financial views all use consistent, well-labeled columns corresponding to documented schema (`docs/ADMIN_TABLE_SCHEMA.md`).
  - Event-related columns align with `AdminEvent` fields and event resolution helpers.

- **Status badges**
  - Payment statuses: consistent color coding across payments and financial view (`success` green, `pending` amber, `failed` red).
  - Pass usage: `PASS_STATUS` (`paid` vs `used`) plus usage badges (Yes/No) in passes table.
  - Teams: `paymentStatus` uses Paid vs raw string with colored badges.

- **Amount & date formatting**
  - Financial tables use `Intl.NumberFormat('en-IN', { currency: 'INR' })` for amounts.
  - Dates use IST (`Asia/Kolkata`) via `Intl.DateTimeFormat` across tables and modals.

**Assessment**: **🟢 Enterprise-grade consistency** – columns, statuses, and formatting are coherent and aligned with schema docs.

### 8.2 Loading, Empty, and Error States

- All major views (unified, operations, registrations, users, passes, teams) include:
  - Skeleton rows during loading.
  - “No results” or “No teams/users/passes found” messages for empty sets.
  - Inline error banners when fetches fail (`error` state).
  - Pagination UI displays current page and selection counts.

**Assessment**: **🟢 Good operational feedback** – clear loading and empty-state handling.

### 8.3 Bulk Actions and Destructive Operations

- **BulkActionBar (`components/admin/BulkActionBar.tsx`)**
  - Actions:
    - Mark used, revert, archive (softDelete), permanent delete, force verify payments (financial mode), export selected CSV.
  - Protection:
    - Each action shows a `window.confirm()` dialog with explicit warnings (especially for revert and delete).
    - RowDetailModal’s delete uses a dedicated confirm modal with explicit “this cannot be undone” copy.
  - **Issue**:
    - As described in RBAC audit, BulkActionBar is visible and functional for all admin roles; there is no role check at the component level.
    - Combined with the bulk-action RBAC gap, this is **operationally dangerous**: a viewer can accidentally delete or mark many passes.

- **TeamsPage destructive flows**
  - Team delete:
    - Dedicated confirm modal with strong warning about permanent deletion of team and “their passes”, but backend delete only removes the team doc, not passes; this mismatch can confuse operators but does not directly corrupt passes.
  - Archive/unarchive toggles and revert-pass-usage for teams have clear icons and tooltips.

**Assessment**: **🔴 Operationally dangerous UI** – BulkActionBar exposes destructive operations to roles that should be read-only; coupled with the backend gap, this is a must-fix.

### 8.4 On-spot and Live Check-in UX

- On-spot registration:
  - Clear forms with strong visual hierarchy and inline hints.
  - Event selection area displays conflicts and disables conflicting events rather than silently allowing them.
  - Recent registrations panel provides immediate feedback on on-spot sessions.

- Live Check-in:
  - Large status indicator (READY / VALID / ALREADY USED / INVALID) with high-contrast colors.
  - Audible feedback (beeps) can be toggled.
  - Auto-reset after 3 seconds reduces operator errors and stale displays.

**Assessment**: **🟢 Operationally safe** – suitable for high-pressure event scenarios.

## 9. Architecture Alignment Report

### 9.1 Server-Side Authority and Validation

- All admin data mutations are performed via server route handlers that:
  - Validate Firebase ID tokens.
  - Enforce organizer/adminRole based on Firestore `users/{uid}`.
  - Use Firestore as the single source of truth for domain entities (`users`, `payments`, `passes`, `teams`, `events`, `registrations`, `admin_dashboard`, `admin_logs`).
  - Honor canonical status fields (`payments.status`, `passes.status`).
- Cashfree integration is intentionally limited to:
  - `fix-stuck-payment` and the various `create-order` endpoints.
  - No client-side Cashfree secrets or direct webhook exposure in the admin app.

**Assessment**: **🟢 Strong alignment** – server-side authority model is implemented as described in the architecture docs.

### 9.2 Business Logic Placement

- Payment and pass creation logic:
  - Centralized in `fix-stuck-payment`, `process-cash-payment`, and the main registration system’s webhook (outside this repo).
  - Admin routes call into these shared flows rather than duplicating logic.
- QR generation and validation:
  - Implemented in `features/passes/qrService.ts` and reused by both pass-creation endpoints and scan-verify.
- Frontend:
  - Avoids re-implementing business logic; it orchestrates flows via API calls and only derives UI-level computations (filters, local selection).

**Assessment**: **🟢 Backend constraints are respected** – no significant business logic duplication on the client.

### 9.3 Firestore Schema and Pass/Team Relationships

- Passes, payments, teams, and events:
  - Follow relationships as documented in `docs/DATABASE_SCHEMA.md` and `docs/WEBHOOK_DATABASE_ANALYSIS.md`.
  - `eventIds`, `selectedEvents`, `teamSnapshot`, and `team.passId` are maintained and, where necessary, backfilled.
  - `admin_dashboard` denormalizes these relationships for dashboard reads.
- Minor inconsistencies:
  - `paymentId` sometimes treated as Cashfree order id, sometimes as payment doc id – the implementation is aware and compensates in fix-stuck-payment and admin-dashboard builders.
  - Teams delete endpoint does not cascade to passes; passes may retain `teamId` pointing to a now-missing team.

**Assessment**: **🟡 Mostly accurate**, with a few cleanup tasks around referential integrity and field semantics.

## 10. Critical Fixes Required Before Production

1. **Lock down bulk pass and team mutations to appropriate roles**
   - Enforce `canMutatePasses` and `canMutateTeams` inside `/api/admin/bulk-action` for all pass/team actions (no `allowWithoutRoleCheck` for these collections).
   - On the frontend, hide `BulkActionBar` buttons for destructive operations unless `adminRole ∈ {manager, superadmin}` (and restrict payment bulk actions to `superadmin`).

2. **Tighten `requireOrganizer` to require `isOrganizer === true`**
   - Align implementation with docs by requiring `isOrganizer === true` and treating `adminRole` purely as an additional role dimension.
   - Run a one-time migration to ensure all users with `adminRole` also have `isOrganizer: true` (the `assign-role` path already does this).

3. **Guard unified dashboard against silent under-coverage**
   - At minimum, surface a warning banner when the unified dashboard is operating on fewer than the total available passes (e.g., when pass count exceeds the scan limit).
   - Preferably, move filters (`passType`, `eventId`, `createdAt` range) back into Firestore queries with composite indexes, and lower the scan limit.

## 11. Recommended Improvements

1. **Refactor unified-dashboard to Firestore-native filtering**
   - Replace the “fetch 2000, filter in memory” pattern with:
     - `where(passType ==)`, `where(selectedEvents array-contains eventId)`, `where(createdAt between ...)`, `orderBy(createdAt)`, `limit(pageSize)` and document-level cursoring.
   - Add necessary composite indexes as documented in `docs/ADMIN_FIRESTORE_USAGE.md` and `docs/ADMIN_PASSES_API.md`.

2. **Convert registrations pagination to cursor-based**
   - Replace `offset((page-1)*pageSize)` with a document-cursor scheme (`startAfter(lastDoc)`), preserving `createdAt desc` ordering and filters.
   - This will keep the pending registrations view snappy even if the queue grows large.

3. **Improve referential integrity around team deletion**
   - When deleting a team via `DELETE /api/admin/teams/[teamId]`:
     - Null out or archive `passes` referencing that `teamId`, or block hard-deletes when passes exist.
   - Adjust UI copy to reflect actual behavior (currently claims passes will be removed).

4. **Clarify and enforce `paymentId` semantics**
   - Standardize whether `paymentId` refers to:
     - The Firestore `payments` doc id, or
     - The Cashfree order id.
   - Update fix-stuck-payment and passes APIs accordingly, and add schema docs to make this explicit.

5. **Role-aware UI controls**
   - Use `userData.adminRole` (from `/api/me`) to:
     - Hide destructive buttons (mark used, revert, delete, archive) for viewers.
     - Mark financial-only views (unified `mode=financial`, payments editing) as superadmin-only.

6. **Tune scan limits for large events**
   - Monitor Firestore usage on unified-dashboard and stats endpoints.
   - If pass volumes grow, consider:
     - Precomputing per-day/per-event materialized views, or
     - Moving heavy aggregations into scheduled Cloud Functions that write to summarized collections.

## 12. Final Verdict

**Production Ready?** **No, not yet.**

The architecture, security model, and financial workflows are robust and largely aligned with the documented design. However, the **bulk-action RBAC gap** and the exposure of powerful destructive operations to read-only roles represent a material operational risk for an event that handles real money and entry control. Once bulk operations are strictly role-gated, unified-dashboard partial-scan behavior is documented or improved, and team/pass referential integrity is tightened, the admin dashboard will be suitable for production use in Takshashila 2026.

---

### Remediation Notes (2026 RBAC Hardening)

- `/api/admin/bulk-action` now enforces `canMutatePasses` / `canMutateTeams` for all pass/team actions; viewer roles can no longer run destructive bulk mutations.
- Scan verification (`/api/admin/scan-verify`) now requires `requireAdminRole` with `adminRole ∈ {manager, superadmin}`; viewers are read-only and cannot operate the scanner UI or API.
- Admin-triggered reconciliation flows (`/api/admin/passes/[passId]/fix-payment`, `/api/admin/onspot/verify`) are restricted to superadmins only.
- Frontend bulk action controls and detail modals respect `adminRole`, disabling destructive buttons for viewers and restricting payment reconciliation to superadmins.

