# Admin Dashboard

This document describes the dashboard views, table structure, filtering, pagination, search behavior, and data visibility rules in the Admin Dashboard application.

## Views

| View | Route / area | Data source | Description |
|------|----------------|-------------|-------------|
| Overview | `/` | GET /api/stats, GET /api/dashboard (optional) | Stats (revenue, passes, payments, teams, users, registrations today/yesterday, pass distribution) and activity feed (recent payments, scans, teams). |
| Unified | `/admin/unified`, `/admin/financial`, `/admin/operations` | GET /api/admin/unified-dashboard | Single API with `mode=operations` or `mode=financial`. Operations: success-only records without amount/orderId. Financial: same records with amount, paymentId, orderId (superadmin only). |
| Financial | `/admin/financial` | GET /api/admin/unified-dashboard?mode=financial | Superadmin-only; shows FinancialRecord (amount, orderId, etc.). |
| Operations | `/admin/operations` | GET /api/admin/unified-dashboard?mode=operations | All organizers; OperationsRecord (no amount/orderId). |
| Passes | `/admin/passes`, `/admin/passes/day-pass`, etc. | GET /api/admin/passes?type=... | Pass management list by pass type (day_pass, group_events, proshow, sana_concert). Summary (totalSold, totalRevenue, totalUsed, remaining; for group_events also totalTeams, totalParticipants, checkedInCount) when includeSummary=1. |
| Payments | `/admin/payments` | GET /api/payments | List of payments with user name/email, amount, status, passType, cashfreeOrderId, dates. |
| Users | `/admin/users` | GET /api/users | List of users (id, name, email, college, phone, isOrganizer, etc.). |
| Teams | `/admin/teams` | GET /api/admin/export/teams, GET /api/admin/teams/[teamId] | Teams list/export and team detail (members, check-in). |
| Events | `/admin/events`, `/admin/events/[eventId]` | GET /api/admin/events, GET /api/admin/events/[eventId] | Events list and event detail with metrics (totalRegistrations, totalCheckIns, teamCount, checkInPercentage). |
| Live Check-in | `/admin/live-checkin` | POST /api/admin/scan-verify | UI to scan or paste QR token; shows result (valid, already_used, invalid) with name, passType, teamName, memberCount. |
| Audit logs | `/admin/audit-logs` | GET /api/admin/logs | List of admin actions (adminId, action, targetCollection, targetId, previousData, newData, ipAddress, timestamp). |

## Table Structure

### Unified / Financial / Operations

- **API:** GET /api/admin/unified-dashboard. Query: `mode`, `page`, `pageSize`, `cursor`, `passType`, `eventId`, `from`, `to`, `q`, `format`, `includeMetrics`, `includeArchived`.
- **Pagination:** Page-based or cursor-based; `pageSize` default 50, max 100 (JSON). For `format=csv`, pageSize up to 2000.
- **Response:** `records`, `page`, `pageSize`, `nextCursor`, optional `total`, `totalPages`, `metrics`, and for financial mode `summary.totalRevenue`.
- **FinancialRecord (financial mode):** userId, passId, paymentId, name, email, college, phone, eventName, passType, amount, paymentStatus, orderId, createdAt.
- **OperationsRecord (operations mode):** passId, name, email, college, phone, eventName, passType, payment: "Confirmed", createdAt. No amount, no orderId, no paymentId in the table.

### Pass Management

- **API:** GET /api/admin/passes. Query: `type` (required), `page`, `pageSize`, `from`, `to`, `includeSummary`.
- **Response:** PassManagementResponse: `records` (PassManagementRecord[]), `page`, `pageSize`, `total`, optional `summary` (totalSold, totalRevenue, totalUsed, remaining; for group_events also totalTeams, totalParticipants, checkedInCount).
- **PassManagementRecord:** passId, paymentId, userName, college, phone, eventName, amount, paymentStatus, passStatus, createdAt, usedAt, scannedBy, teamName, totalMembers, checkedInCount, team (GroupEventsTeam when type=group_events).

### Payments List

- **API:** GET /api/payments. Flat list: id, userId, name, email, amount, status, passType, cashfreeOrderId, createdAt, updatedAt, isArchived.

### Users List

- **API:** GET /api/users. Flat list: id, name, email, college, phone, isOrganizer, createdAt, updatedAt, referralCode, inviteCount, dayPassUnlocked, isArchived.

## Filtering

- **Unified dashboard:** `passType`, `eventId`, `from`, `to` (date range on pass createdAt), `q` (search in name/email, applied after fetch), `includeArchived` (1 to include archived passes).
- **Pass management:** `type` (required), `from`, `to`, `includeSummary`. Archived passes are excluded unless the API supports includeArchived.
- **Dashboard (admin_dashboard):** `college`, `passType`, `paymentStatus` (via filterPassTypes / filterPaymentStatuses), `limit`, `cursor`. `includeArchived` not applied to admin_dashboard in the dashboard route; payments/passes routes use includeArchived for their own lists.
- **Payments / Users / Passes lists:** `includeArchived` (1 to include archived).
- **Events:** `activeOnly` (default true), `includeArchived`.
- **Export teams:** `includeArchived`.

## Pagination

- **Unified:** `page` (1-based) and `pageSize`, or `cursor` with pageSize. Response includes `nextCursor` when there are more results. Default pageSize 50, max 100 (JSON); CSV up to 2000.
- **Pass management:** `page`, `pageSize`; server fetches up to a cap (e.g. 500 or 2000 when includeSummary) then slices; `total` is length of filtered list.
- **Dashboard (admin_dashboard):** `limit`, `cursor`; response `nextCursor` when more docs exist.
- **Logs:** `limit` (default 50, max 200).

## Search

- **Unified dashboard:** Query param `q` (string). Applied after building the record set: filters records where the concatenation of name and email (lowercase) includes `q` (lowercase). So search is server-side within the current page/cursor window.

## Data Visibility Rules

- **Financial view (amounts, orderId, paymentId):** Only when **superadmin**. GET /api/admin/unified-dashboard with `mode=financial` returns 403 for non-superadmin. Operations view (no amounts/orderIds) is visible to all organizers.
- **Audit logs:** Available to any organizer (or adminRole as implemented); logs are sanitized so sensitive fields are not stored (see below). Who did what and which collection/id are visible; sensitive field values are redacted.
- **Payments list:** Organizer can see all payments (with optional includeArchived). No role-based filtering of rows; financial fields (amount, cashfreeOrderId) are present in the payments list for all organizers. (Financial *view* in the unified UI is superadmin-only; the raw payments API is organizer-scoped.)

## Sensitive Field Exclusions (Audit Logs)

Audit log entries are written by `lib/admin/adminLogger.ts`. Before writing `previousData` and `newData`, the logger **redacts** the following keys (replaces value with `[REDACTED]`):

- amount  
- qrCode  
- token  
- signature  
- secret  
- password  
- cashfreeOrderId  
- paymentId  

So in `admin_logs` documents, these fields never contain real values. API responses for the **financial** view (superadmin) still include amount and orderId in the response body; only the stored audit log is sanitized.

## Client-Side Cache

The dashboard uses a client-side TTL cache (`lib/clientCache.ts`) to avoid redundant API calls and rate-limit pressure. Default TTL 10 minutes. After mutations (e.g. update-pass, bulk-action, fix-payment), callers should call `invalidateCache(key)` or `invalidateCachePrefix(prefix)` so the next read fetches fresh data.
