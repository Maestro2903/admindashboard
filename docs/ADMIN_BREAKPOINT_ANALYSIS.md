## Admin breakpoint analysis (fragile spots)

This document lists **brittle areas** in the admin dashboard that are likely to break or misbehave when:

- Fields become `null` / missing
- New enum-like values are introduced (e.g. `passType`, `status`)
- Relationships (pass → payment → team → events) are absent or inconsistent

It is **descriptive only** – no code has been changed.

---

## 1. Null / missing field sensitivity

- **Users table (`/admin/users`)**
  - `app/admin/users/page.tsx`
    - Search uses:
      - `u.name?.toLowerCase().includes(q)` and `u.college?.toLowerCase().includes(q)` – safe with optional chaining.
      - `u.phone?.includes(q)` – safe if `phone` is `null` or `undefined`, but **assumes phone is a string** when present (badly formatted phones can still search poorly).
    - Displays:
      - `u.name || '—'`, `u.email || '—'`, `u.college || '—'`, `u.phone || '—'` – robust to `null`/missing.
    - Breakage risk: **low** for nulls; main fragility is schema drift (e.g., renaming `inviteCount`, `dayPassUnlocked`) that is not guarded.

- **Payments table (`/admin/payments`)**
  - `app/admin/payments/page.tsx`
    - Sort logic:
      - For `createdAt` / `updatedAt`:
        - `new Date(a[sortBy]!).getTime()` – the non-null assertion (`!`) means **if these are ever non-ISO strings or non-date-like, `NaN` is coerced to `0` but `new Date(undefined)` still runs**.
        - Sorting will silently mis-order when timestamps are corrupted or non-ISO.
      - For non-date fields:
        - `((a[sortBy as keyof Payment] as string) ?? '').toLowerCase()` – **assumes string-like values**; if a refactor changes `amount` or `status` type, this will throw.
    - CSV export:
      - Uses raw values for `passType`, `status`, timestamps; nulls are coerced to empty strings, so **no runtime crash**, but inconsistent schemas produce inconsistent exports.

- **Teams table (`/admin/teams`)**
  - `app/admin/teams/page.tsx`
    - Search:
      - `t.teamName.toLowerCase()`, `t.leaderId.toLowerCase()`, `t.eventName?.toLowerCase()` – strong assumption that `teamName` and `leaderId` are **non-null strings**.
      - `t.leaderPhone?.replace(/\D/g, '')` and `m.phone.replace(/\D/g, '')` – assumes `phone` is **non-null string** for members.
      - **If any of `teamName`, `leaderId`, or `member.name` / `member.phone` becomes `null`, this throws.**
    - Attendance:
      - `team.members.some(...)` and `team.members.filter(...)` assume `members` is an **array**, but the state initialization always provides `[]`, so risk is mainly on Firestore docs being malformed (e.g., `members` not an array).
    - Member mapping:
      - Reads non-standard fields (`checkedIn`, `checkInTime`, `checkedInBy`) from top-level members; if those are ever removed in favor of nested `attendance`, the UI silently shows **all members as not checked in**.

- **Pass explorer / management (`/admin/passes`, `/admin/passes/*`)**
  - `app/admin/passes/page.tsx` (PassExplorer)
    - Filtering:
      - `r.userName.toLowerCase()` – assumes `userName` is **always non-empty string**.
      - `r.passId.toLowerCase()`, `r.teamName?.toLowerCase()`, `r.eventName?.toLowerCase()`, `r.phone?.toLowerCase()` – passId must be a string; optional chaining on others is safe.
    - Sorting:
      - `new Date(a.createdAt).getTime()` / `new Date(a.usedAt).getTime()` – **assumes ISO strings**; bad formats degrade sorting silently.
    - Display:
      - Calls `formatPhone(r.phone)` – assumes `phone` is either `string` or falsy; if `phone` becomes an object or number, formatting may misbehave.
  - `components/admin/PassManagementView.tsx` (pass-type-specific tables, referenced in `ADMIN_TABLE_SCHEMA.md`)
    - Uses `new Date(row.createdAt)` / `new Date(row.usedAt)` for filters and displays.
    - Filters like `filters.from` / `filters.to` compare dates based on parsed `Date` objects; **if createdAt is not a valid date**, comparisons behave like zero, skewing results.

- **Unified / Financial / Operations views**
  - Server API (`app/api/admin/unified-dashboard/route.ts`)
    - Derives `createdAt` with `toIso(d.createdAt) ?? new Date(0).toISOString()` – records with invalid dates get a sentinel epoch; **this keeps the API from crashing but can push such records to the start of lists**.
    - `passTypeStr = getString(d, 'passType') ?? ''` – if `passType` is missing, downstream UIs get empty string and default styles; no crash but poor semantics.
  - Client tables (`UnifiedViewClient`, `FinancialViewClient`, `OperationsClient`)
    - All use `new Date(r.createdAt)` – invalid strings become `Invalid Date`, but formatting code will still call `.getTime()`, effectively treating them as zero; again, mis-ordered rather than hard failing.
    - `formatPhone(r.phone)` used widely; assumes phone is string-like.

- **Live check-in / scan verify**
  - `/admin/live-checkin` UI and `/api/admin/scan-verify` backend (not re-quoted here) assume:
    - `passes/{passId}` documents have consistent `status`, `usedAt`, `selectedEvents` / `eventIds`.
    - Missing `userId` or null user docs degrade some UX fields but do not crash; the handler checks for `null` user before fetching.

---

## 2. Enum / string-value fragility (`passType`, `status`, etc.)

- **`passType` variations**
  - Known set used across UI:
    - `day_pass`, `group_events`, `proshow`, `sana_concert`.
  - Hard-coded label maps:
    - `PASS_TYPE_LABELS` in multiple components (`PassExplorer`, `Operations`, `Financial`, management views).
  - Breakpoint:
    - Adding a new pass type (e.g. `vip_pass`) will:
      - Show as raw string or fall through to generic labels/colors in some tables.
      - Potentially be excluded from type-specific queries (e.g. `ALLOWED_TYPES` in `/api/admin/passes`).
      - Cause **incomplete analytics** if new type is not included in grouping/labeling logic.

- **Payment `status` values**
  - Core logic treats **only `'success'`** as “paid”:
    - `/api/admin/passes`: `if (paymentStatus !== 'success') continue;`
    - `/api/admin/unified-dashboard`: same success-only filter after join.
    - `/app/api/stats`: counts where `status === 'success'`.
  - Scripts show broader status vocabulary (`paid`, `succeeded`, etc.) and derive a `success` boolean.
  - Breakpoints:
    - If gateway or ingestion starts using a new success string (e.g. `'captured'`, `'completed'`), passes will **fall out of admin views** and analytics because they are filtered by strict equality.
    - If `payment.success` boolean is added and used elsewhere but not wired into these filters, behavior diverges between new and old code paths.

- **Team `paymentStatus`**
  - Teams UI (`/admin/teams`) assumes:
    - `team.paymentStatus === 'success'` means fully paid, else the status string is shown as-is (styled as warning).
  - Breakpoints:
    - Changing `paymentStatus` semantics (e.g. to `paid`, `completed`) makes teams appear “unpaid” or “other status” even when they are valid.
    - If `paymentStatus` is removed in favor of a derived field, the UI will fallback to `'success'` default in some code paths, masking issues.

- **Pass `status`**
  - Backend assumes `'paid' | 'used'` (see `PassStatus` in `types/admin.ts`).
  - Many UIs compute:
    - `passStatus = d.status === 'used' || d.usedAt ? 'used' : 'paid'`.
  - Breakpoints:
    - Introducing a third value (e.g. `'refunded'`, `'cancelled'`) will be coerced into `'paid'` in most views, making it impossible to see the difference without schema changes.

---

## 3. Relationship / linkage breakpoints

- **Pass without `paymentId`**
  - `/api/admin/passes` and `/api/admin/unified-dashboard` join on `paymentId` and **drop** any pass whose joined payment:
    - does not exist, or
    - exists but `status !== 'success'`.
  - Breakpoints:
    - Pass docs missing `paymentId` (or with mismatched IDs) are **invisible in admin passes, unified, and financial/operations views**.
    - Historical passes created before `paymentId` was enforced will not show up unless a migration backfills that field.

- **Team without `passId` / `teamId` inconsistencies**
  - Team exports and group-event views rely on:
    - `pass.teamId` to join into the `teams` collection, and
    - `teams.passId` / `teamSnapshot` for embedded copies.
  - Breakpoints:
    - A team without `passId` (or with stale `passId`) will be present in `teams` exports but may not be visible via the passes-based Team derivation (from `/api/admin/passes?type=group_events`).
    - If `teamSnapshot` exists in `passes` but the canonical `teams/{teamId}` doc is deleted, admin views will still show the embedded snapshot, which can drift from reality.

- **Events linkage (`selectedEvents`, `eventIds`, legacy fields)**
  - Several code paths read:
    - `passes.selectedEvents: string[]`
    - `passes.eventIds: string[]` (fallback)
    - `passes.eventId` / `passes.selectedEvent` (legacy singulars).
  - Breakpoints:
    - If a new pipeline only writes `eventIds` but not `selectedEvents`, **unified-dashboard filters** (which use `where('selectedEvents','array-contains', eventId)`) will not match unless backfilled.
    - If none of `selectedEvents | eventIds | eventId | selectedEvent` are present, event dashboards and exports will show event name `'—'` or default to team name/day-pass strings.

- **Users missing contact/college fields**
  - Payments and analytics UIs assume:
    - `name`, `email`, `college`, `phone` exist on user or derived from payment/customer payloads.
  - Breakpoints:
    - If both user and payment docs lack these, many views display blank names/emails/colleges and rely solely on IDs, which complicates operations (but does not crash).

---

## 4. Client-side-only filtering / “full collection” breakpoints

These do not usually cause runtime errors but become operationally fragile as data grows or when fields are null.

- **Full collection scans**
  - `/api/users`, `/api/payments`, `/api/passes`, `/api/stats`, `/api/admin/events`, `/api/admin/export/teams`, and some scripts (`backfill-admin-dashboard`, `backfill-event-ids`, `db-inspect`) all perform:
    - `.get()` on entire `users`, `payments`, `passes`, `teams`, or `events` without Firestore-level pagination.
  - Breakpoints:
    - Collections growing beyond expected size **impact latency and cost** and can hit memory/time limits.
    - Any schema drift (new fields, nulls) can surface as subtle UI bugs that are hard to detect because filtering/sorting happens in-memory over very large arrays.

- **Client-only pagination**
  - Admin Users and Payments tables:
    - Fetch full list, then slice per-page on the client.
  - Pass management views:
    - Use per-type fixed limits (`limit(500)` per type, then in-memory pagination).
  - Breakpoints:
    - As counts grow, UI performance degrades first, then server cost spikes; once Firestore reads hit limits, handlers may time out or be force-capped, **silently dropping records from admin visibility**.

---

## 5. Specific “what if” scenarios from the brief

- **Field becomes `null`**
  - High-risk UI points:
    - `/admin/teams` search: `team.teamName.toLowerCase()`, `team.leaderId.toLowerCase()`, `member.name.toLowerCase()`, `member.phone.replace(...)`.
    - `/admin/operations` filters: `events.map((e) => e.category).filter(Boolean)` assumes `events` array elements are objects with string keys; null elements here could break `filter(Boolean)` or set building.
  - High-risk API points:
    - Unified/Passes APIs guard many fields with helper functions; they generally coerce to `''` instead of crashing, but this can **hide malformed data** rather than fail loudly.

- **New `passType` added**
  - Affects:
    - `/api/admin/passes` (`ALLOWED_TYPES`), `/api/admin/unified-dashboard` (no explicit enum but UI filters assume known set), all table label/color mappings.
  - Result:
    - New type may **not be fetchable** by the passes API, or may be fetchable but render with generic labels.

- **Team has no `passId`**
  - Teams export still works (reads `teams` collection directly).
  - Pass-derived Teams view (`/admin/teams` via `/api/admin/passes`) misses such teams, creating **discrepancy between exports and in-app view**.

- **`selectedDays` is `null` or empty**
  - Day-pass naming often falls back to `selectedDay` / `selectedDays`-derived labels (see `deriveEventName` logic and usage in passes/unified APIs).
  - When `selectedDays` is `null`, data already exists (see `docs/firestore_exports/payments.json`), and:
    - APIs that treat day-pass event name as `selectedDay` may produce `'—'` or fallback event strings.
    - No crashes, but **ambiguous or missing event labels** in analytics.

- **`selectedEvents` is empty**
  - Event-level filters (`eventId`) and analytics:
    - Unified/Passes APIs still return the pass (it’s filtered by payment success and other fields), but event filters that rely on `selectedEvents` will **not match** such passes.
    - Event dashboards that also look at `eventIds` may partially compensate, but behavior is inconsistent.

- **`success` boolean removed or never populated**
  - Core admin paths **do not rely on a `success` boolean**; they use `status === 'success'`.
  - Fragility exists only in scripts (e.g. exports) that derive `success` for convenience – removing that derived field from exports changes CSV shape but not admin runtime.

---

## 6. Summary of highest-risk hotspots

- **Strong string assumptions** in `/admin/teams` and `/admin/operations` around names/phones – null/shape changes will throw at runtime.
- **Strict `'success'` equality checks** for payments across passes/unified/stats: any new success-like status will be treated as unpaid.
- **Pass–payment–team–event linkage**: missing `paymentId`, `teamId`, or `selectedEvents` / `eventIds` cause records to silently drop from key admin views while still existing in Firestore.
- **Full-collection, client-filtered endpoints** (`/api/users`, `/api/payments`, `/api/passes`, `/api/stats`, some admin exports) are scalability and correctness pressure points as data volume and schema complexity grow.

