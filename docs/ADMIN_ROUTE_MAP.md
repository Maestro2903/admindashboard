## Admin route map (Next.js App Router)

This document maps **admin UI routes** (`/admin/*`) to their **page components**, **layouts**, **backing API routes / server handlers**, and the **auth + role validation** that protects data and mutations.

### Protection layers (cross-cutting)

- **Edge middleware rate limiting**: `middleware.ts`
  - **Applies to**: `'/api/admin/:path*'`, `'/api/passes/scan'`, `'/api/passes/scan-member'`
  - **Purpose**: rate limiting only (no auth enforcement). It **decodes** JWT payload to get UID (no signature verify) for rate-limit keying, then forwards with `x-rate-limit-checked: 1`.
- **Server-side auth gate**: `lib/admin/requireOrganizer.ts`
  - **Mechanism**: `firebase-admin` `verifyIdToken()` then checks `users/{uid}.isOrganizer === true`
  - **Used by**: most admin read APIs (and some non-`/api/admin` endpoints used by admin pages).
- **Server-side role gate**: `lib/admin/requireAdminRole.ts`
  - **Mechanism**: wraps `requireOrganizer()`, then reads `users/{uid}.adminRole`.
  - **Important detail**: `parseRole()` defaults **missing/invalid role to `'manager'`**, despite the comment indicating `'viewer'`.
  - **Capability helpers**:
    - `canMutatePasses(role)` → `manager|superadmin`
    - `canMutateTeams(role)` → `manager|superadmin`
    - `canMutateUsersPaymentsEvents(role)` → `superadmin` only

### Admin layouts (UI-only)

All admin layouts found are **metadata/pass-through** wrappers (no auth logic in layout code):

- `app/admin/passes/layout.tsx`
- `app/admin/users/layout.tsx`
- `app/admin/payments/layout.tsx`
- `app/admin/teams/layout.tsx`
- `app/admin/live-checkin/layout.tsx`
- `app/admin/audit-logs/layout.tsx`

---

## Admin UI routes

### `/admin/users`

- **Page component**: `app/admin/users/page.tsx` (`UsersPage`, client component)
- **Data source**:
  - **Reads**: `GET /api/users` (admin users listing)
  - **Mutations**: `POST /api/admin/update-user` (edit user fields + organizer flag)
- **Auth check method**:
  - Client: `useAuth()` and `user.getIdToken()`; passes `Authorization: Bearer <token>` to APIs.
  - Server:
    - `GET /api/users` → `requireOrganizer(req)` (must be organizer)
    - `POST /api/admin/update-user` → `requireAdminRole(req)` + `canMutateUsersPaymentsEvents(role)` (**superadmin only**)
- **Role validation method**:
  - `requireAdminRole()` reads `users/{uid}.adminRole` and applies `canMutateUsersPaymentsEvents()`.

### `/admin/payments`

- **Page component**: `app/admin/payments/page.tsx` (`PaymentsPage`, client)
- **Data source**:
  - **Reads**: `GET /api/payments` (payments list)
  - **Mutations**:
    - `POST /api/admin/update-payment`
    - `POST /api/admin/bulk-action` with `targetCollection: 'payments'` (bulk verify/delete)
- **Auth check method**:
  - Client: `useAuth()` + ID token in `Authorization` header.
  - Server:
    - `GET /api/payments` → `rateLimitAdmin('dashboard')` + `requireOrganizer(req)`
    - `POST /api/admin/update-payment` → `rateLimitAdmin('mutation')` + `requireAdminRole(req)` + `canMutateUsersPaymentsEvents(role)` (**superadmin only**)
    - `POST /api/admin/bulk-action` → `rateLimitAdmin('mutation')` + `requireAdminRole(req)` (capability checks depend on the handler’s internal logic for `targetCollection`)
- **Role validation method**:
  - `requireAdminRole()` + capability gating for payment updates.

### `/admin/teams`

- **Page component**: `app/admin/teams/page.tsx` (`TeamsPage`, client)
- **Data source**:
  - **Reads**: `GET /api/admin/passes?type=group_events&pageSize=200&includeSummary=1`
    - UI derives teams from `PassManagementResponse.records[*].team`
  - **Exports**: `GET /api/admin/export/teams` (CSV)
- **Auth check method**:
  - Client: `useAuth()` + token.
  - Server:
    - `GET /api/admin/passes` → `rateLimitAdmin('dashboard')` + `requireOrganizer(req)`
    - `GET /api/admin/export/teams` → `rateLimitAdmin('export')` + `requireOrganizer(req)`
- **Role validation method**:
  - Reads are organizer-only via `requireOrganizer()`.
  - Any team mutations are via separate admin APIs (see `/api/admin/update-team` and `/api/admin/bulk-action`).

### `/admin/passes` (Pass Explorer)

- **Page component**: `app/admin/passes/page.tsx` (`PassExplorerPage`, client)
- **Data source**:
  - **Reads**: multiple calls to `GET /api/admin/passes?type=...&page=...&pageSize=100&includeSummary=1`
    - If UI passType = `all`, it fetches and merges: `day_pass`, `group_events`, `proshow`, `sana_concert`.
  - **Row mutations**: `PATCH /api/admin/passes/[passId]` with `{ action: 'markUsed' | 'revertUsed' }`
  - **Bulk mutations**: `POST /api/admin/bulk-action` with `targetCollection: 'passes'`
  - **CSV export**: client-side CSV generation from returned records (no server export)
- **Auth check method**:
  - Client: `useAuth()` + token.
  - Server:
    - `GET /api/admin/passes` → `rateLimitAdmin('dashboard')` + `requireOrganizer(req)`
    - `PATCH /api/admin/passes/[passId]` → `requireAdminRole(req)` + `canMutatePasses(role)`
    - `POST /api/admin/bulk-action` → `requireAdminRole(req)` (and logs actions)
- **Role validation method**:
  - Pass reads: organizer.
  - Pass mutations: role-based via `requireAdminRole()` + `canMutatePasses()`.

### `/admin/passes/day-pass`
### `/admin/passes/group-events`
### `/admin/passes/proshows`
### `/admin/passes/all-day-pass`

- **Page components**:
  - `app/admin/passes/day-pass/page.tsx`
  - `app/admin/passes/group-events/page.tsx`
  - `app/admin/passes/proshows/page.tsx`
  - `app/admin/passes/all-day-pass/page.tsx` (note: renders type `sana_concert` and title “All Day Pass (Sana Concert)”)
- **Shared view**: `components/admin/PassManagementView.tsx` (client)
- **Data source**:
  - **Reads**: `GET /api/admin/passes?type=<passType>&page=<n>&pageSize=50[&includeSummary=1]`
  - **Exports**: `components/admin/ExportButtons` (client-side export from loaded rows)
- **Auth + role validation**: same as `/admin/passes` reads (organizer) for the backing `GET /api/admin/passes`.

### `/admin/unified` (Unified operations view)

- **Page component**: `app/admin/unified/page.tsx` → `UnifiedViewClient` (client)
- **Data source**:
  - **Reads events**: `GET /api/admin/events?activeOnly=1`
  - **Reads unified records**: `GET /api/admin/unified-dashboard?pageSize=50&cursor=<passId?>&q=...&passType=...&eventId=...&eventCategory=...&eventType=...&from=...&to=...`
  - **CSV export**: same endpoint with `format=csv&pageSize=1000`
- **Auth check method**:
  - Client: `useAuth()` + token.
  - Server:
    - `GET /api/admin/unified-dashboard` → `rateLimitAdmin('dashboard'|'export')` + `requireAdminRole(req)`
    - Mode defaults to `operations` unless `mode=financial`
- **Role validation method**:
  - Requires organizer + role resolution (`requireAdminRole()`); operations mode is allowed for non-superadmins.

### `/admin/financial` (Financial view)

- **Page component**: `app/admin/financial/page.tsx` → `FinancialViewClient` (client)
- **Data source**:
  - **Reads events**: `GET /api/admin/events?activeOnly=1`
  - **Reads financial records**: `GET /api/admin/unified-dashboard?mode=financial&pageSize=50&cursor=...&...filters`
  - **CSV export**: `GET /api/admin/unified-dashboard?mode=financial&format=csv&pageSize=1000&...filters`
- **Auth check method**:
  - Server: `GET /api/admin/unified-dashboard` → `requireAdminRole(req)`
- **Role validation method**:
  - Explicit check: if `mode=financial` and `adminRole !== 'superadmin'` → `forbiddenRole()` (403).

### `/admin/operations` (Operations view)

- **Page component**: `app/admin/operations/page.tsx` → `OperationsClient` (client)
- **Data source**:
  - **Reads events**: `GET /api/admin/events?activeOnly=1`
  - **Reads operations records**: `GET /api/admin/unified-dashboard?mode=operations&pageSize=...&cursor=...&...filters`
  - **CSV export**: same endpoint with `format=csv`
- **Auth + role validation**:
  - Server: `requireAdminRole(req)`; operations mode allowed unless restricted by additional checks in handler.

### `/admin/events/[eventId]` (Event dashboard)

- **Page component**: `app/admin/events/[eventId]/page.tsx` (`EventDashboardPage`, client)
- **Data source**:
  - `GET /api/admin/events/[eventId]` (event + metrics)
  - `GET /api/admin/unified-dashboard?eventId=<id>&pageSize=500` (records for the event)
  - `GET /api/admin/events/[eventId]/export` (CSV export)
- **Auth + role validation**:
  - `GET /api/admin/events/[eventId]` → `rateLimitAdmin('dashboard')` + `requireOrganizer(req)`
  - `GET /api/admin/events/[eventId]/export` → `rateLimitAdmin('export')` + `requireOrganizer(req)`
  - `GET /api/admin/unified-dashboard?...eventId=...` → `requireAdminRole(req)` (organizer + role)

### `/admin/live-checkin` (Scanner UI)

- **Page component**: `app/admin/live-checkin/page.tsx` (`LiveCheckinPage`, client)
- **Data source**:
  - `POST /api/admin/scan-verify` (verifies a scanned pass payload or raw input)
- **Auth + role validation**:
  - Server: `POST /api/admin/scan-verify` → `rateLimitAdmin('scan')` + `requireOrganizer(req)`

### `/admin/audit-logs` (Admin logs)

- **Page component**: `app/admin/audit-logs/page.tsx` (`AuditLogsPage`, client)
- **Data source**:
  - `GET /api/admin/logs`
- **Auth + role validation**:
  - Server: `GET /api/admin/logs` uses `requireAdminRole(req)` (organizer + role) and rate limiting.

