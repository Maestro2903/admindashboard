## Admin dashboard data assumptions

This document lists **implicit/explicit assumptions** baked into the admin UI and admin APIs. If the Firestore schema drifts, these are the places most likely to become incorrect or fail.

---

## Auth / RBAC assumptions

- **Organizer flag**: `users/{uid}.isOrganizer === true` is the primary gate for admin access (enforced server-side by `lib/admin/requireOrganizer.ts`).
- **Admin role values**: `users/{uid}.adminRole` is assumed to be one of `viewer|manager|superadmin` (`types/admin.ts`).
- **Missing adminRole behavior**:
  - `lib/admin/requireAdminRole.ts` assumes *missing/invalid role should still allow mutations for organizers* by defaulting to **`'manager'`**.
  - Other endpoints like `app/api/me/route.ts` return `adminRole: null` if missing/invalid.

---

## Payments assumptions

- **`payments.status` is canonical**:
  - Many code paths treat `"success"` as the only “paid” state (e.g. `app/api/admin/passes/route.ts`, `app/api/admin/unified-dashboard/route.ts`, `app/api/stats/route.ts`).
  - UI expects it to be one of `success|pending|failed` (e.g. `app/admin/payments/page.tsx` status filter, status styling).
- **Success filtering method**:
  - Pass lists and unified dashboards assume “valid passes” are those whose joined payment has `status === 'success'`.
- **`payment.success` boolean is not relied on in core code**:
  - A script (`scripts/admin/export-firestore-json.js`) *derives* a `success` boolean from string status values (`paid|success|succeeded`), implying older or external data might use different status naming.
- **Payment → events linkage**:
  - `getEventIdsFromPayment()` is used for payment filtering (in-memory) in `app/api/payments/route.ts`.
  - Unified views join via pass→event, not payment→event.

---

## Passes assumptions

- **Pass status values**: `passes.status` is assumed to be `'paid' | 'used'` (see `types/admin.ts` `PassStatus`).
  - Multiple places treat “used” as `status === 'used'` **OR** `usedAt` being set.
- **Pass types are a closed set**:
  - UI hard-codes pass type labels/colors in multiple places:
    - `day_pass`, `group_events`, `proshow`, `sana_concert`
  - New pass types will show as raw strings in some tables (or as default “unknown” styles).
- **Pass → payment linkage is assumed present**:
  - Admin pass APIs join on `passes.paymentId` and then require the payment doc to have `status === 'success'`.
  - Missing/invalid `paymentId` causes a pass record to be dropped from admin pass lists (because payment status cannot be proven success).
- **Pass → event linkage fields**:
  - Preferred: `passes.selectedEvents: string[]` (used by `unified-dashboard` via `array-contains`)
  - Also supported / legacy:
    - `passes.eventIds: string[]` (best-effort in event detail/export)
    - `passes.eventId` or `passes.selectedEvent` (singular legacy fields, merged into list in `app/api/admin/passes/route.ts`)
- **Day pass event naming**:
  - For `passType === 'day_pass'`, event display may use `passes.selectedDay` string as “event name” (see `deriveEventName` logic in `app/api/admin/passes/route.ts`).

---

## Teams assumptions

- **Team payment status**:
  - UI and exports assume `teams.paymentStatus === 'success'` means “paid”.
  - Some code falls back to `teams.status` if `paymentStatus` is missing.
- **Team → pass linkage**:
  - Some flows assume `teams.passId` exists (e.g. export includes it; migrations backfill `eventIds` from `passId`).
  - The dashboard logic can still function from embedded `passes.teamSnapshot` if the `teams/{teamId}` doc is missing.
- **Team members attendance structure**:
  - Most server code expects `members[*].attendance.checkedIn` (and optionally `checkedInAt`, `checkedInBy`).
  - The `/admin/teams` page currently maps member attendance from **top-level** fields (`checkedIn`, `checkInTime`, `checkedInBy`) on each member object, not from `attendance.*`.

---

## Events assumptions

- **Active flag**: `events.isActive` is treated as boolean; admin UI defaults to `activeOnly=1` for filters.
- **Allowed pass types**: `events.allowedPassTypes` is assumed to be `string[]` and is used in:
  - UI display (`components/admin/EventDashboard.tsx`)
  - Fix-stuck-payment event resolution (`allowedPassTypes array-contains passType`)

---

## UI-derived / formatting assumptions

- **Phone normalization**: UI assumes `phone` is present and parseable as digits for `formatPhone()` usage; some search paths strip `\\D` and compare digit strings.
- **Dates are ISO strings**:
  - Most tables treat `createdAt`/`updatedAt`/`usedAt` as ISO strings and parse them via `new Date(iso)`.
  - Unified/financial tables format dates using IST timezone, assuming parsing succeeds.

---

## Filtering + pagination assumptions

- **Client-side filtering/sorting assumes complete datasets**:
  - Users and Payments pages load full lists and then filter/sort/paginate on the client.
- **Pass management date filters assume lexical comparability**:
  - `components/admin/PassManagementView.tsx` filters by `if (filters.from) out = out.filter(r => r.createdAt >= filters.from)`
  - This assumes `r.createdAt` is ISO-like and comparable to `YYYY-MM-DD` strings; if formats differ, filtering becomes incorrect.

