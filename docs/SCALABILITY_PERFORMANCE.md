# Scalability & Performance — CIT Takshashila 2026 Admin Dashboard

## Architecture overview

The admin dashboard is a Next.js 16 App Router application deployed on Vercel. All backend logic
runs as serverless Node.js functions. The primary data store is Firebase Firestore.

---

## Admin Rate Limiting Architecture

### The problem: serverless + in-memory state

Serverless functions are stateless by design. Each Vercel invocation may run in a different
function instance. An in-memory `Map` or object used as a rate limiter is **not shared** between
instances. Under real event-day load:

- Multiple simultaneous requests → multiple concurrent instances
- Each instance has its own counter starting at 0
- A single organizer can fire N requests before any instance sees a repeat

**Conclusion:** In-memory rate limiters are security theatre in a serverless environment. They provide
zero protection against distributed or concurrent abuse.

### The solution: distributed sliding-window counters via Upstash Redis

Redis is the industry-standard solution for distributed counters. Upstash Redis specifically:

- Exposes an **HTTP REST API** (no TCP sockets, no connection pools)
- Is compatible with **Vercel Edge** and **Node.js serverless** runtimes
- Executes **atomic Lua scripts** for sliding-window counters
- Provides **global replication** for low latency across Vercel regions
- Has a **free tier** sufficient for moderate admin traffic

The `@upstash/ratelimit` library implements a true sliding-window algorithm (not a fixed-window,
which has burst leakage at window boundaries).

### Sliding window vs fixed window

```
Fixed window (bad):
  Window 0–60s: allow 100 requests
  Window 60–120s: allow 100 requests
  
  Attack: 100 requests at t=59s + 100 requests at t=61s → 200 requests in 2 seconds
  
Sliding window (good):
  At any point in time: count requests in the last 60 seconds
  
  100 requests at t=59s: used 100/100 in window [0, 60]
  At t=61s: window is now [1, 61]; earlier requests are ageing out
  → 2 requests allowed, not 100
```

The sliding-window algorithm eliminates burst leakage at window boundaries.

### Two-layer defence

```
Internet
   │
   ▼
[Vercel CDN / WAF]
   │
   ▼
[Edge Middleware]  ← Layer 1: rl:mw:* (fastest, runs before route code)
   │
   ▼
[Route Handler]    ← Layer 2: rl:admin:* (catches internal calls, bypasses)
   │
   ▼
[Firebase Auth]    ← Token verification
   │
   ▼
[Firestore]        ← Data
```

Layer 1 (Edge Middleware) runs as close to the user as possible and returns 429 without invoking
the route handler — saving compute cost and Firestore reads for abusive traffic.

Layer 2 (route-level `rateLimitAdmin`) provides a second enforcement point for requests that
bypass the middleware (e.g. internal service-to-service calls on the same Vercel deployment,
or misconfigured reverse proxies that strip middleware matching headers).

### Rate limit categories and rationale

| Category | Limit | Reasoning |
|---|---|---|
| `scan` | 30/min | Physical scan rate ceiling. A human operator cannot scan more than ~30 QR codes per minute in practice. Stricter limit also prevents credential-stuffing the scan endpoint. |
| `export` | 10/min | CSV exports trigger large Firestore reads. 10/min prevents export hammering that could exhaust Firestore quota. |
| `bulk` | 30/min | Bulk actions are high blast-radius (up to 100 records per request). Lower limit than general mutations. |
| `mutation` | 60/min | Standard CRUD operations. Allows rapid legitimate use during event setup without permitting scripted abuse. |
| `search` | 60/min | Search/filter calls are read-heavy. 60/min is generous for interactive UI use but blocks scraping. |
| `dashboard` | 100/min | Dashboard poll requests from the React frontend. 100/min supports aggressive polling intervals while blocking scanners. |

### Graceful degradation

If Redis is unavailable (network failure, misconfiguration, Upstash outage):

- All rate limit checks **pass through** (allow the request)
- The system logs a warning but does not block legitimate traffic
- The legacy `checkRateLimit` in `rateLimiter.ts` additionally falls back to an in-memory counter

This ensures that a Redis outage does not take down the admin dashboard during a live event.

---

## Firestore performance

### Read patterns

The admin dashboard is read-heavy. Key optimisations:

- **`admin_dashboard` collection** (`/api/dashboard`) — pre-computed denormalised documents, one per user. Avoids fan-out reads of users + payments + passes at query time.
- **Cursor-based pagination** — `unified-dashboard` uses Firestore cursor pagination (`startAfter`) rather than offset pagination, avoiding full collection scans.
- **Parallel fetches** — related documents (users, payments, events) are fetched concurrently with `Promise.all`, not sequentially.
- **`count()` aggregation** — metrics use Firestore's native `count()` aggregation instead of fetching all documents to count them.

### Index strategy

Key composite indexes required:

- `passes`: `passType` (asc) + `createdAt` (desc) — for type-filtered paginated pass lists
- `passes`: `createdAt` (asc/desc) — for date-range filtered unified dashboard
- `payments`: `status` (asc) — for success-filtered payment counts
- `admin_logs`: `timestamp` (desc) — for audit log pagination

See `firestore.indexes.json` for the full index configuration.

---

## Vercel deployment considerations

### Cold start mitigation

- Firebase Admin SDK is initialised as a **module-level singleton** (`lib/firebase/adminApp.ts`) — warm instances reuse the existing connection
- Upstash Redis client is a **module-level singleton** in both `middleware.ts` and `adminRateLimiter.ts` — HTTP client is reused across warm invocations
- Rate limiter instances are **cached in module-level Maps** — avoids re-creating `Ratelimit` objects on every request

### Memory

- In-memory fallback rate limiter (`rateLimiter.ts`) uses a simple `Record<string, {count, resetTime}>` — entries accumulate over a warm instance's lifetime but are bounded by the window duration and flushed on instance recycling
- No persistent in-process caches for Firestore data — all reads go to Firestore, relying on Firestore's own caching and connection pooling

### Function regions

Set `VERCEL_REGION` or configure `vercel.json` to colocate the functions with your Firestore region
(e.g. `asia-south1` for Mumbai) to minimise latency.

---

## Scalability ceiling

| Component | Ceiling | Notes |
|---|---|---|
| Vercel functions | Unlimited concurrent | Auto-scales; rate limiting prevents Firestore quota exhaustion |
| Upstash Redis | 10,000 req/day (free) / unlimited (paid) | Rate limit checks = 2 Redis calls per request (one per layer) |
| Firestore reads | 50,000/day (free) / pay-per-use | Export and unified-dashboard are the heaviest consumers |
| Firebase Auth token verification | ~50ms per call | Cached within warm instances for the same token |

For event day (expected peak: ~200 concurrent admin sessions), the architecture scales without
modification. The primary cost driver is Firestore reads, not compute.
