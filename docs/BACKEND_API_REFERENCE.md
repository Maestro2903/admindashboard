# Backend API Reference — CIT Takshashila 2026 Admin Dashboard

## Overview

All API routes live under `app/api/` and run on the Node.js runtime (serverless functions on Vercel).
Every admin route requires a valid Firebase ID token in the `Authorization: Bearer <token>` header.
Token verification is performed by `lib/admin/requireOrganizer.ts` or `lib/admin/requireAdminRole.ts`.

---

## Admin Rate Limiting Architecture

### Why distributed rate limiting is required in serverless

Vercel deploys each API route as an independent serverless function. Each cold-started instance has
its own memory space. An in-memory rate limiter (e.g. a `Map<string, count>`) resets on every new
instance and is invisible to all other concurrent instances. Under real event-day traffic:

- 10+ simultaneous cold starts = 10 independent counters
- A single user can exceed the intended limit by a factor equal to the concurrent instance count
- Memory leaks in long-lived warm instances are masked by the short lifespan of serverless functions
  but still affect burst behaviour

### Why in-memory limiters fail at scale

| Problem | Impact |
|---|---|
| Per-instance counter | Limit effectively multiplied by concurrent function count |
| No shared state | Burst attacks spread across instances bypass all per-limit checks |
| Warm-instance drift | Long-lived instances accumulate state; cold instances start fresh |
| No observability | Cannot log or alert on cross-instance aggregate abuse |

### Why Upstash Redis is chosen

Upstash Redis provides an HTTP REST API compatible with Vercel Edge and Node.js serverless runtimes.
It requires no persistent TCP connection and has sub-millisecond p99 latency from Vercel regions.

Key properties:
- **Atomic sliding-window counters** — `@upstash/ratelimit` uses Lua scripts executed atomically on Redis, guaranteeing correct per-user counts across all function instances
- **HTTP-only** — no connection pooling, no leaked sockets, compatible with Edge runtime
- **Global replication** — Upstash global databases replicate to multiple regions for low latency
- **Cost-effective** — free tier covers development and moderate traffic; pay-per-request pricing scales linearly

### Implementation layers

Rate limiting is applied in two independent layers for defence-in-depth:

```
Request
  │
  ▼
┌─────────────────────────────────────────────────┐
│  Edge Middleware (middleware.ts)                 │
│  Redis prefix: rl:mw:<category>                 │
│  Runs BEFORE the route handler                  │
│  Returns 429 immediately for blatant abusers    │
└────────────────────┬────────────────────────────┘
                     │  (passes through)
                     ▼
┌─────────────────────────────────────────────────┐
│  Route-level guard (adminRateLimiter.ts)        │
│  Redis prefix: rl:admin:<category>              │
│  Runs INSIDE the route handler                  │
│  Catches requests that bypassed middleware      │
│  (internal service calls, misconfigured proxies)│
└─────────────────────────────────────────────────┘
```

Both layers use independent Redis key prefixes, so they count separately. This is intentional — it
provides a secondary enforcement layer without double-counting for observability purposes.

### Rate limit categories

| Category | Limit | Window | Routes |
|---|---|---|---|
| `scan` | 30 req | 1 min | `POST /api/admin/scan-verify` |
| `export` | 10 req | 1 min | `GET /api/admin/export/teams`, `GET /api/admin/events/[id]/export`, `GET /api/admin/unified-dashboard?format=csv` |
| `bulk` | 30 req | 1 min | `POST /api/admin/bulk-action` |
| `mutation` | 60 req | 1 min | `POST /api/admin/update-*`, `DELETE/PATCH /api/admin/passes/[id]`, `POST /api/admin/passes/[id]/fix-payment` |
| `search` | 60 req | 1 min | Routes with `?q=` query parameter |
| `dashboard` | 100 req | 1 min | All other `GET /api/admin/*`, `GET /api/dashboard`, `GET /api/payments` |

### Rate limit key

The identifier used to bucket requests (in priority order):

1. **Firebase UID** — decoded from the JWT payload (unverified at this stage; full verification is in each route). This prevents shared-IP false positives (e.g. corporate NAT, university campus networks).
2. **`x-forwarded-for` first IP** — for unauthenticated or pre-auth requests.
3. **`x-real-ip`** — fallback.
4. **`anonymous`** — last resort.

### Response headers

All rate-limited responses include:

| Header | Value |
|---|---|
| `X-RateLimit-Limit` | Configured limit for this category |
| `X-RateLimit-Remaining` | Remaining requests in current window (0 on 429) |
| `Retry-After` | Seconds until the window resets |

### Graceful degradation

If `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` are not set, or if Redis throws an error,
**all rate limiters allow traffic through without blocking**. This prevents a Redis outage from
taking down the admin dashboard during a live event.

The legacy `checkRateLimit` in `lib/security/rateLimiter.ts` additionally falls back to an
in-memory fixed-window counter as a last resort.

---

## Authentication & Authorization

### Authentication

All admin routes call either:
- `requireOrganizer(req)` — verifies Firebase ID token and checks `users/{uid}.isOrganizer === true`
- `requireAdminRole(req)` — calls `requireOrganizer` then reads `users/{uid}.adminRole`

### Roles

| Role | Permissions |
|---|---|
| `viewer` | Read-only access to all admin data |
| `manager` | Reads + mutations on passes and teams |
| `superadmin` | Full access including financial data, user management, event management |

---

## API Routes

### Scan

| Method | Path | Auth | Rate limit | Description |
|---|---|---|---|---|
| POST | `/api/admin/scan-verify` | organizer | scan (30/min) | Verify and record QR code scan |

### Dashboard reads

| Method | Path | Auth | Rate limit | Description |
|---|---|---|---|---|
| GET | `/api/admin/unified-dashboard` | adminRole | dashboard (100/min) | Paginated unified pass+payment+user view |
| GET | `/api/admin/passes` | organizer | dashboard (100/min) | Paginated pass management view |
| GET | `/api/admin/events` | organizer | dashboard (100/min) | List events |
| GET | `/api/admin/events/[eventId]` | organizer | dashboard (100/min) | Event detail + metrics |
| GET | `/api/admin/teams/[teamId]` | organizer | dashboard (100/min) | Team detail |
| GET | `/api/admin/passes/[passId]/qr` | organizer | dashboard (100/min) | Regenerate QR code |
| GET | `/api/admin/logs` | adminRole | dashboard (100/min) | Admin audit log |
| GET | `/api/dashboard` | organizer | dashboard (100/min) | Legacy dashboard (admin_dashboard collection) |
| GET | `/api/payments` | organizer | dashboard (100/min) | All payments list |

### Exports

| Method | Path | Auth | Rate limit | Description |
|---|---|---|---|---|
| GET | `/api/admin/export/teams` | organizer | export (10/min) | CSV export of all teams |
| GET | `/api/admin/events/[eventId]/export` | organizer | export (10/min) | CSV export of event registrations |
| GET | `/api/admin/unified-dashboard?format=csv` | adminRole | export (10/min) | CSV export of unified dashboard |

### Mutations

| Method | Path | Auth | Rate limit | Description |
|---|---|---|---|---|
| POST | `/api/admin/update-pass` | manager+ | mutation (60/min) | Update pass status / fields |
| POST | `/api/admin/update-team` | manager+ | mutation (60/min) | Update team |
| POST | `/api/admin/update-event` | superadmin | mutation (60/min) | Update event |
| POST | `/api/admin/update-payment` | superadmin | mutation (60/min) | Update payment |
| POST | `/api/admin/update-user` | superadmin | mutation (60/min) | Update user |
| DELETE | `/api/admin/passes/[passId]` | manager+ | mutation (60/min) | Hard delete pass |
| PATCH | `/api/admin/passes/[passId]` | manager+ | mutation (60/min) | Mark used / revert |
| POST | `/api/admin/passes/[passId]/fix-payment` | organizer | mutation (60/min) | Fix stuck payment |
| POST | `/api/admin/bulk-action` | role-dependent | bulk (30/min) | Bulk mutations |

### Webhooks (not rate limited)

| Method | Path | Description |
|---|---|---|
| POST | `/api/webhooks/cashfree` | Cashfree payment webhook — excluded from all rate limiting |

---

## Error Response Format

All errors follow a consistent structure:

```json
{ "error": "Human-readable message" }
```

Rate limit exceeded:
```json
{ "error": "Too many requests. Please slow down." }
```
Status: `429`. Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`.

Validation errors:
```json
{ "error": "Validation failed", "issues": [...] }
```
Status: `400`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Production | Upstash Redis REST API endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Production | Upstash Redis REST API token |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Yes | Firebase Admin SDK email |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Yes | Firebase Admin SDK private key |
| `QR_SECRET_KEY` | Yes | HMAC key for QR code signing |
| `RESEND_API_KEY` | Yes | Transactional email API key |
| `CASHFREE_APP_ID` | Yes | Cashfree payment gateway app ID |
| `CASHFREE_SECRET_KEY` | Yes | Cashfree payment gateway secret |
