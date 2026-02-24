## Admin table schema vs data (UI ↔ API ↔ Firestore)

This document enumerates the **columns displayed**, the **field names used**, and any **derived/assumed structure** for key admin tables:

- Users table (`/admin/users`)
- Payments table (`/admin/payments`)
- Teams table (`/admin/teams`)
- Passes tables (`/admin/passes` and `/admin/passes/*`)
- Analytics tables (Unified / Financial / Operations views)

---

## Users table (`/admin/users`)

- **UI**: `app/admin/users/page.tsx`
- **Data loading**: `hooks/use-users.ts` → `GET /api/users`
- **Underlying Firestore**: `app/api/users/route.ts` reads `users` collection (full scan, best-effort order by `createdAt`).

### Columns displayed (header → field(s))

- **Name** → `user.name` (primary) + `user.email` (secondary line)
- **College** → `user.college`
- **Phone** → `user.phone`
- **Role** → `user.isOrganizer` (Organizer badge vs “User”)
- **Invites** → `user.inviteCount` (defaults to 0 in UI)
- **Created** → `user.createdAt` (ISO string formatted in IST)
- **Actions** → row action (Edit)

### Edit fields (side sheet)

- **Email (read-only)** → `editUser.email`
- **Name** → `name`
- **Phone** → `phone`
- **College** → `college`
- **Promote to Organizer** → `isOrganizer`
- **Save** → `POST /api/admin/update-user` with `{ userId, name?, phone?, college?, isOrganizer }`

### Derived fields / formatting

- **Created display**: `new Intl.DateTimeFormat('en-IN', { timeZone:'Asia/Kolkata', ... }).format(new Date(createdAt))`
- **Search**: client-side substring match against `name`, `email`, `phone`, `college`

---

## Payments table (`/admin/payments`)

- **UI**: `app/admin/payments/page.tsx`
- **Data loading**: `hooks/use-payments.ts` → `GET /api/payments`
- **Underlying Firestore**: `app/api/payments/route.ts` reads `payments` (full scan) and joins `users/{userId}` for name/email.

### Columns displayed (header → field(s))

- **(Select)** → UI-only selection state keyed by `payment.id`
- **Order ID** → `payment.cashfreeOrderId || payment.id.slice(0, 12)`
- **Name** → `payment.name` (derived on server by joining user)
- **Email** → `payment.email` (derived on server by joining user)
- **Pass Type** → `payment.passType`
- **Amount** → `payment.amount`
- **Status** → `payment.status` (string: `success|pending|failed|...`)
- **Created** → `payment.createdAt` (ISO string formatted in IST)
- **Updated** → `payment.updatedAt` (ISO string formatted in IST)
- **Actions** → row action (Edit)

### Filters / sorting / pagination (UI-side)

- **Status filter**: `statusFilter` (`all|success|pending|failed`)
- **Search filter**: matches `cashfreeOrderId`, `id`, `passType`, `name`, `email` (client-side)
- **Sorting** (client-side): by `createdAt|updatedAt|amount|name|status|passType`
- **Pagination** (client-side): slices the in-memory list with `PAGE_SIZE = 50`

### Mutations (admin APIs)

- **Edit Payment**: `POST /api/admin/update-payment`
  - Writes `payments/{paymentId}`: `status` and optional `adminNote`
- **Bulk actions**: `POST /api/admin/bulk-action` with:
  - `action='forceVerifyPayment'` (sets `status='success'`)
  - `action='delete'` (hard delete)

---

## Teams table (`/admin/teams`)

- **UI**: `app/admin/teams/page.tsx`
- **Data loading**: direct fetch to `GET /api/admin/passes?type=group_events&pageSize=200&includeSummary=1`
  - The page **derives teams from pass records**: `PassManagementResponse.records[*].team`
- **Underlying Firestore**:
  - `app/api/admin/passes/route.ts` reads `passes` (where `passType='group_events'`) and joins `teams`, `users`, `payments`, `events`.

### Columns displayed (header → field(s))

- **(Expand)** → UI-only expanded row state by `team.id`
- **Team Name** → `team.teamName`
- **Leader** → `team.leaderId` (note: assigned from `record.team.leaderName` in the UI mapping)
- **Phone** → `team.leaderPhone` (formatted via `formatPhone()`)
- **Events** → `team.eventName` (server-derived from event resolution; client treats as string)
- **Members** → `team.totalMembers`
- **Payment** → `team.paymentStatus` (UI treats `success` as Paid; else shows raw string)
- **Attendance** → computed:
  - `checkedIn = team.members.filter(m => m.attendance?.checkedIn).length`
  - `attendancePercent = checkedIn / totalMembers`

### Expanded row: member fields used

The UI maps each member to:

- `memberId`, `name`, `phone`, `isLeader`
- `attendance.checkedIn` is read from a **non-standard shape**:
  - `checkedIn: (m as Record).checkedIn`
  - `checkedInAt: (m as Record).checkInTime`
  - `checkedInBy: (m as Record).checkedInBy`

This differs from other parts of the code that expect `member.attendance.checkedIn` / `attendance.checkedInAt`.

### Exports

- **CSV export**: `GET /api/admin/export/teams` reads the `teams` collection and computes `checkedIn` by iterating `members[*].attendance.checkedIn`.

---

## Passes (Explorer) table (`/admin/passes`)

- **UI**: `app/admin/passes/page.tsx` (`PassExplorerPage`)
- **Data loading**: `GET /api/admin/passes` for one or more pass types; results merged client-side.
- **Underlying Firestore**: `app/api/admin/passes/route.ts`
  - Reads `passes.where(passType==type).limit(500)`, then joins `payments/users/teams/events`.
  - Filters out non-success payments **after join** (`payment.status === 'success'`).

### Columns displayed (header → field(s))

- **(Select)** → UI-only bulk selection keyed by `record.passId`
- **Pass ID** → `record.passId`
- **User** → `record.userName` (+ may show `teamName` in expanded view)
- **Phone** → `record.phone`
- **Pass Type** → derived from selected tab/filter; labels via `PASS_TYPE_LABELS`
- **Event** → `record.eventName`
- **Amount** → `record.amount`
- **Status** → `record.passStatus` (`paid|used`)
- **Scanned** → derived from `record.usedAt` (Yes/No) and/or `passStatus`
- **Created** → `record.createdAt`
- **Actions** → mutations:
  - mark used / revert used → `PATCH /api/admin/passes/[passId]`

### Derived fields and assumptions

- **CSV export**: generated client-side with headers:
  - `['Pass ID','User','Phone','Pass Type','Event','Amount','Status','Scanned','Created At']`
- **Client-side filtering**: search over `userName`, `passId`, `phone`, `teamName`, `eventName`
- **Client-side sorting**: uses `createdAt`, `usedAt`, `amount`, `userName` from the loaded data

---

## Passes (Management views) tables (`/admin/passes/day-pass`, `/group-events`, `/proshows`, `/all-day-pass`)

- **UI entrypoints**:
  - `app/admin/passes/day-pass/page.tsx` → `<PassManagementView type="day_pass" />`
  - `app/admin/passes/group-events/page.tsx` → `<PassManagementView type="group_events" />`
  - `app/admin/passes/proshows/page.tsx` → `<PassManagementView type="proshow" />`
  - `app/admin/passes/all-day-pass/page.tsx` → `<PassManagementView type="sana_concert" />`
- **Shared UI**: `components/admin/PassManagementView.tsx`
- **Backing API**: `GET /api/admin/passes?type=<type>&page=<n>&pageSize=50[&from&to]`

### Table columns (from `components/admin/PassTable.tsx`)

There are two display modes:

1) **Standard pass rows** (most pass types, and group events without embedded team payload):

- Pass ID → `row.passId`
- User Name → `row.userName`
- (Group events only) Team Name → `row.teamName`
- (Group events only) Total Members → `row.totalMembers`
- (Group events only) Checked-In → `row.checkedInCount`
- College → `row.college`
- Phone → `row.phone`
- Amount → `row.amount`
- Payment → `row.paymentStatus` (expected `'success'`)
- Pass Status → `row.passStatus` (`paid|used`)
- Created At → `row.createdAt`
- Used At → `row.usedAt`
- Scanned By → `row.scannedBy`

2) **Group-events with full team payload** (when `row.team` is present):

- Pass ID / Payment ID / Amount / Pass Status / Created At / Used At / Scanned By
- Team Name / Team ID / Members / Leader / Leader Phone / Leader College / Payment
- Expanded “Team members” nested table uses:
  - `team.members[*].name`, `phone`, `email`, `isLeader`, `checkedIn`, `checkInTime`, `checkedInBy`

### Filters (from `components/admin/PassFilters.tsx`)

- Date range: `filters.from`, `filters.to` (as `YYYY-MM-DD` strings)
- Pass status: `filters.passStatus` (`paid|used|all`)
- Scanned: `filters.scanned` (`scanned|not_scanned`)
- Amount min/max: `filters.amountMin`, `filters.amountMax`
- Group events only:
  - team size min/max: `filters.teamSizeMin`, `filters.teamSizeMax`
  - checked-in min: `filters.checkedInMin`

---

## Analytics tables (Unified / Financial / Operations)

These pages share a common backing API: `GET /api/admin/unified-dashboard` (operations mode by default; `mode=financial` for financial view).

### Unified view (`/admin/unified`)

- **UI**: `app/admin/unified/UnifiedViewClient.tsx`
- **Table component**: `components/admin/UnifiedTable.tsx`
- **Record type**: `CleanUnifiedRecordWithId` (`types/admin.ts`)

#### Columns displayed

- (Select) → row selection keyed by `passId` (hidden field)
- Pass Type → `passType` (also used for grouping)
- Event → `eventName` (also used for grouping)
- Name → `name`
- Email → `email`
- College → `college` (also used for grouping)
- Phone → `phone`
- Payment → **static** “SUCCESS” pill (the API promises success-only data)
- Registered On → `createdAt` (formatted in IST)

#### Filters surfaced in table UI

- `q`, `passType`, `eventId`, `eventCategory`, `eventType`, `from`, `to`

### Financial view (`/admin/financial`)

- **UI**: `app/admin/financial/FinancialViewClient.tsx`
- **Table component**: `components/admin/FinancialTable.tsx`
- **Record type**: `FinancialRecord`

#### Columns displayed

- (Select) → row selection keyed by `passId`
- Name → `name`
- College → `college`
- Phone → `phone`
- Email → `email`
- Event → `eventName`
- Pass Type → `passType`
- Amount → `amount` (formatted as INR currency)
- Payment → `paymentStatus` (string)
- Order ID → `orderId`
- Created → `createdAt`

### Operations view (`/admin/operations`)

- **UI**: `app/admin/operations/OperationsClient.tsx`
- **Table**: inline (memoized `TableRow`)
- **Record type**: `OperationsRecord`

#### Columns displayed

- (Select) → row selection keyed by `passId`
- Name (+ Email) → `name`, `email`
- Pass Type → `passType` (label/color maps)
- Event → `eventName`
- College → `college`
- Phone → `phone` (formatted via `formatPhone`)
- Payment → `payment` (string; color map expects `Confirmed|success|pending|failed|paid`)
- Created → `createdAt`

