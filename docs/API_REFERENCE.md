# API Reference

All admin and organizer API routes require authentication via Firebase ID token. Rate limiting is applied by Edge middleware and/or route-level checks. Errors are returned as JSON with appropriate status codes.

## Conventions

- **Authentication:** Send the Firebase ID token in the request header:  
  `Authorization: Bearer <idToken>`
- **Rate limiting:** Applied to routes under the middleware matcher (`/api/admin/*`, `/api/passes/scan`, `/api/passes/scan-member`). When exceeded, response is **429** with body `{ error: "Too many requests. Please slow down." }` and headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`.
- **Errors:** JSON body `{ error: string }` (and optionally `issues`, `details`). Typical status: 400 (validation/bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 429 (rate limit), 500 (server error).

## Rate Limit Categories

| Category | Limit | Window | Applied to |
|----------|--------|--------|------------|
| scan | 30 | 1 min | POST /api/admin/scan-verify |
| bulk | 30 | 1 min | POST /api/admin/bulk-action |
| export | 10 | 1 min | GET /api/admin/export/*, GET /api/admin/events/[eventId]/export, unified-dashboard?format=csv |
| search | 60 | 1 min | Requests with `q` query param |
| mutation | 60 | 1 min | POST/PUT/PATCH to admin mutation routes |
| dashboard | 100 | 1 min | GET reads (dashboard, stats, passes, payments, users, events, teams, logs, unified-dashboard without format=csv) |

Middleware uses prefix `rl:mw:*`; route-level limiter uses `rl:admin:*`. Identifier is Firebase UID from token (or IP fallback).

---

## Route Summary

| Path | Method | Auth | Role | Rate category | Purpose |
|------|--------|------|------|----------------|---------|
| /api/me | GET | Organizer | — | — | Current user profile and adminRole |
| /api/dashboard | GET | Organizer | — | dashboard | Paginated admin_dashboard docs |
| /api/stats | GET | Organizer | — | — | Overview stats and activity feed |
| /api/users | GET | Organizer | — | — | List users |
| /api/payments | GET | Organizer | — | dashboard | List payments |
| /api/passes | GET | Organizer | — | — | List passes (flat) |
| /api/fix-stuck-payment | POST | Organizer | — | legacy 3/60s | Fix PAID order and create pass if missing |
| /api/admin/unified-dashboard | GET | AdminRole | financial=superadmin | dashboard/export | Unified table (operations or financial), CSV export |
| /api/admin/passes | GET | Organizer | — | dashboard | Pass management list by type |
| /api/admin/passes/[passId]/fix-payment | POST | Organizer | — | mutation | Proxy fix-stuck-payment by passId |
| /api/admin/passes/[passId] | PATCH | AdminRole | canMutatePasses | mutation | markUsed / revertUsed |
| /api/admin/passes/[passId] | DELETE | AdminRole | canMutatePasses | mutation | Hard delete pass |
| /api/admin/passes/[passId]/qr | GET | Organizer | — | dashboard | Pass QR code URL |
| /api/admin/scan-verify | POST | Organizer | — | scan | Verify QR token and return pass status |
| /api/admin/update-payment | POST | AdminRole | canMutateUsersPaymentsEvents | mutation | Update payment status/note/archive |
| /api/admin/update-pass | POST | AdminRole | canMutatePasses | mutation | Update pass (status, events, team, QR, archive) |
| /api/admin/update-user | POST | AdminRole | canMutateUsersPaymentsEvents | mutation | Update user profile and flags |
| /api/admin/update-team | POST | AdminRole | canMutateTeams | mutation | Update team name/members/attendance/archive |
| /api/admin/update-event | POST | AdminRole | canMutateUsersPaymentsEvents | mutation | Update event fields |
| /api/admin/bulk-action | POST | AdminRole | per action | bulk | Bulk markUsed, revertUsed, softDelete, etc. |
| /api/admin/events | GET | Organizer | — | dashboard | List events |
| /api/admin/events/[eventId] | GET | Organizer | — | dashboard | Event detail and metrics |
| /api/admin/events/[eventId]/export | GET | Organizer | — | export | Export event data |
| /api/admin/teams/[teamId] | GET | Organizer | — | dashboard | Team detail |
| /api/admin/export/teams | GET | Organizer | — | export | Teams CSV export |
| /api/admin/logs | GET | AdminRole | — | dashboard | Audit logs |

---

## Non-Admin Routes

### GET /api/me

**Auth:** requireOrganizer.

**Response:** `{ uid, email, name, isOrganizer: true, adminRole }`  
`adminRole` is `"viewer"` | `"manager"` | `"superadmin"` or null if not set.

**Errors:** 401 (no/invalid token, or not organizer), 404 (profile not found).

---

### GET /api/dashboard

**Auth:** requireOrganizer. **Rate limit:** dashboard.

**Query:** `limit` (default 20, max 100), `cursor`, `college`, `passType`, `paymentStatus`.

**Response:** `{ documents, nextCursor, count }` — each document is an admin_dashboard doc (userId, profile, payments, passes, teams, summary, filterPassTypes, filterPaymentStatuses, updatedAt serialized).

**Errors:** 401, 403, 429, 500.

---

### GET /api/stats

**Auth:** requireOrganizer.

**Response:** `{ stats, activity }`.  
- `stats`: OverviewStats (totalSuccessfulPayments, revenue, activePasses, usedPasses, pendingPayments, teamsRegistered, totalUsers, registrationsToday, registrationsYesterday, passDistribution).  
- `activity`: Array of ActivityFeedItem (id, type: 'scan'|'payment'|'team'|'pass', message, timestamp), last 20.

**Errors:** 401, 403, 500.

---

### GET /api/users

**Auth:** requireOrganizer.

**Query:** `includeArchived` (1 to include archived users).

**Response:** `{ users, count }`. Each user: id, name, email, college, phone, isOrganizer, createdAt, updatedAt, referralCode, inviteCount, dayPassUnlocked, isArchived.

**Errors:** 401, 403, 500.

---

### GET /api/payments

**Auth:** requireOrganizer. **Rate limit:** dashboard.

**Query:** `includeArchived` (1 to include archived).

**Response:** `{ payments, count }`. Each payment: id, userId, name, email, amount, status, passType, cashfreeOrderId, createdAt, updatedAt, isArchived.

**Errors:** 401, 403, 429, 500.

---

### GET /api/passes

**Auth:** requireOrganizer.

**Query:** `includeArchived` (1 to include archived).

**Response:** `{ passes, count }`. Each pass: id, userId, passType, amount, status, paymentId, usedAt, scannedBy, createdAt, teamId, isArchived.

**Errors:** 401, 403, 500.

---

### POST /api/fix-stuck-payment

**Auth:** requireOrganizer. **Rate limit:** 3 requests per 60s (route-level, `lib/security/rateLimiter.ts`).

**Body:** `{ orderId: string }`.

**Response (success):** `{ success: true, message?, passId?, qrCode?, details? }`.

**Errors:** 400 (missing orderId, or Cashfree order not PAID), 401, 403, 404 (payment not found), 429, 500 (Cashfree/config error). See [PAYMENT_FLOW.md](PAYMENT_FLOW.md).

---

## Admin Routes

### GET /api/admin/unified-dashboard

**Auth:** requireAdminRole. **Mode=financial requires superadmin** (403 otherwise). **Rate limit:** dashboard, or export when `format=csv`.

**Query:**  
`mode` = `financial` | `operations` (default operations).  
`page`, `pageSize` (default 50, max 100; CSV: max 2000), `cursor`, `passType`, `eventId`, `from`, `to` (date range), `q` (search name/email), `format` = `csv`, `includeMetrics` (default 1), `includeArchived` (1 to include).

**Response (JSON):**  
- Operations: `{ records: OperationsRecord[], page, pageSize, nextCursor?, metrics?, total?, totalPages? }`.  
- Financial: same shape with `records: FinancialRecord[]` and `summary: { totalRevenue }`.  
Records are success-only; financial includes amount, paymentId, orderId; operations does not.

**Response (CSV):** `Content-Type: text/csv`, attachment filename operations.csv or registrations.csv.

**Errors:** 401, 403 (e.g. financial as non-superadmin), 429, 500.

---

### GET /api/admin/passes

**Auth:** requireOrganizer. **Rate limit:** dashboard.

**Query:** `type` (required: day_pass | group_events | proshow | sana_concert), `page`, `pageSize` (default 50, max 100), `from`, `to`, `includeSummary` (1 for summary).

**Response:** PassManagementResponse: `{ records: PassManagementRecord[], page, pageSize, total?, summary? }`. Summary includes totalSold, totalRevenue, totalUsed, remaining; for group_events also totalTeams, totalParticipants, checkedInCount.

**Errors:** 400 (missing/invalid type), 401, 403, 429, 500 (including Firestore index hint).

---

### POST /api/admin/passes/[passId]/fix-payment

**Auth:** requireOrganizer. **Rate limit:** mutation.

**Body:** none (passId from URL). Looks up pass.paymentId and calls internal fix-stuck-payment.

**Response:** `{ success: true, message?, passId? }`.

**Errors:** 400 (pass has no paymentId), 401, 403, 404 (pass not found), 429, 500.

---

### PATCH /api/admin/passes/[passId]

**Auth:** requireAdminRole, canMutatePasses. **Rate limit:** mutation.

**Body:** `{ action: "markUsed" | "revertUsed" }`.

**Response:** `{ success: true, status: "used" | "paid" }`.

**Errors:** 400 (invalid action or already used / not used), 401, 403, 404, 429, 500.

---

### DELETE /api/admin/passes/[passId]

**Auth:** requireAdminRole, canMutatePasses. **Rate limit:** mutation.

**Response:** `{ success: true }`.

**Errors:** 401, 403, 404, 429, 500.

---

### GET /api/admin/passes/[passId]/qr

**Auth:** requireOrganizer. **Rate limit:** dashboard.

**Response:** `{ passId, qrCodeUrl }` (data URL of QR image).

**Errors:** 400 (missing passId), 401, 403, 404, 429, 500.

---

### POST /api/admin/scan-verify

**Auth:** requireOrganizer. **Rate limit:** scan (30/min).

**Body:** `{ token: string }` (signed QR token).

**Response:**  
- Valid: `{ result: "valid", passId, name?, passType?, teamName?, memberCount?, message }`  
- Already used: `{ result: "already_used", ... }`  
- Invalid: `{ result: "invalid", message }`  
Always 200; result indicates outcome.

**Errors:** 400 (invalid JSON), 401, 403, 429, 500.

---

### POST /api/admin/update-payment

**Auth:** requireAdminRole, canMutateUsersPaymentsEvents. **Rate limit:** mutation.

**Body (Zod):** `paymentId` (string), optional `status` ('pending'|'success'|'failed'), `note` (string), `isArchived` (boolean).

**Response:** `{ success: true, paymentId, status, isArchived }`.

**Errors:** 400 (validation), 401, 403, 404, 429, 500.

---

### POST /api/admin/update-pass

**Auth:** requireAdminRole, canMutatePasses. **Rate limit:** mutation.

**Body (Zod):** `passId` (string), optional `status` ('paid'|'used'), `selectedEvents` (string[]), `teamId` (string|null), `regenerateQr` (boolean), `isArchived` (boolean).

**Response:** `{ success: true, passId, status, isArchived }`.

**Errors:** 400 (validation), 401, 403, 404, 429, 500.

---

### POST /api/admin/update-user

**Auth:** requireAdminRole, canMutateUsersPaymentsEvents. **Rate limit:** mutation.

**Body (Zod):** `userId` (string), optional `isOrganizer`, `phone`, `college`, `name`, `isArchived` (boolean).

**Response:** `{ success: true, ... }` (implementation-defined).

**Errors:** 400 (validation), 401, 403, 404, 429, 500.

---

### POST /api/admin/update-team

**Auth:** requireAdminRole, canMutateTeams. **Rate limit:** mutation.

**Body (Zod):** `teamId` (string), optional `teamName`, `members` (array of { memberId, name, phone?, isLeader?, attendance? }), `resetAttendance` (boolean), `removeMemberId` (string), `isArchived` (boolean).

**Response:** `{ success: true, ... }`.

**Errors:** 400 (validation), 401, 403, 404, 429, 500.

---

### POST /api/admin/update-event

**Auth:** requireAdminRole, canMutateUsersPaymentsEvents. **Rate limit:** mutation.

**Body (Zod):** `eventId` (string), optional `isActive`, `venue`, `allowedPassTypes` (string[]), `date`, `registrationOpen`, `name`.

**Response:** `{ success: true, ... }`.

**Errors:** 400 (validation), 401, 403, 404, 429, 500.

---

### POST /api/admin/bulk-action

**Auth:** requireAdminRole. **Rate limit:** bulk.

**Body (Zod):** `action` (enum: markUsed, revertUsed, forceVerifyPayment, softDelete, delete, activateEvent, deactivateEvent), `targetCollection` ('passes'|'payments'|'teams'|'users'|'events'), `targetIds` (string[], max 100).

**Role rules:** Pass/team mutations (markUsed, revertUsed, softDelete for passes/teams) require canMutatePasses. Payment/user/event mutations require canMutateUsersPaymentsEvents.

**Response:** Implementation-defined (e.g. success count or per-id results).

**Errors:** 400 (validation or action/collection mismatch), 401, 403, 429, 500.

---

### GET /api/admin/events

**Auth:** requireOrganizer. **Rate limit:** dashboard.

**Query:** `activeOnly` (default 1), `includeArchived` (1 to include).

**Response:** `{ events: AdminEvent[], count }`. AdminEvent: id, name, category, type, date, venue, allowedPassTypes, isActive, isArchived.

**Errors:** 401, 403, 429, 500.

---

### GET /api/admin/events/[eventId]

**Auth:** requireOrganizer. **Rate limit:** dashboard.

**Response:** `{ event: AdminEvent, metrics: { totalRegistrations, totalCheckIns, teamCount, remainingExpected, checkInPercentage } }`.

**Errors:** 400 (missing eventId), 401, 403, 404, 429, 500.

---

### GET /api/admin/events/[eventId]/export

**Auth:** requireOrganizer. **Rate limit:** export.

**Response:** Export format (e.g. CSV) for event registrations/check-ins. Implementation-defined.

**Errors:** 401, 403, 404, 429, 500.

---

### GET /api/admin/teams/[teamId]

**Auth:** requireOrganizer. **Rate limit:** dashboard.

**Response:** `{ teamId, teamName, totalMembers, passId, paymentStatus, members: [{ memberId, name, phone, isLeader, checkedIn }] }`.

**Errors:** 400 (missing teamId), 401, 403, 404, 429, 500.

---

### GET /api/admin/export/teams

**Auth:** requireOrganizer. **Rate limit:** export.

**Query:** `includeArchived` (1 to include).

**Response:** CSV with headers Team Name, Total Members, Checked In, Pass Id, Payment Status.

**Errors:** 401, 403, 429, 500.

---

### GET /api/admin/logs

**Auth:** requireAdminRole. **Rate limit:** dashboard.

**Query:** `limit` (default 50, max 200).

**Response:** `{ logs: AuditLogEntry[] }`. Each entry: id, adminId, action, targetCollection, targetId, previousData, newData (sanitized), ipAddress, timestamp.

**Errors:** 401, 403, 429, 500.
