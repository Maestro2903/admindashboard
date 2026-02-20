/**
 * middleware.ts — Next.js Edge Middleware
 *
 * Applies distributed rate limiting to all admin API routes before they
 * reach route handlers. Uses Upstash Redis (HTTP-based, Edge-compatible).
 *
 * Rate limit key: Firebase UID (decoded from JWT payload without verification)
 * with IP fallback. Full token verification still happens in each route handler.
 *
 * Uses separate Redis key prefix (rl:mw:*) from route-level limiters (rl:admin:*)
 * so the two layers are independent. Both enforce the same per-category limits.
 *
 * Graceful degradation: if Redis is not configured or throws, the request
 * is passed through without blocking legitimate traffic.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { Ratelimit, type Duration } from '@upstash/ratelimit';

// ---------------------------------------------------------------------------
// Redis singleton (module-level, reused across warm Edge invocations)
// ---------------------------------------------------------------------------

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

// ---------------------------------------------------------------------------
// Limiter cache keyed by category name
// ---------------------------------------------------------------------------

const _limiters: Record<string, Ratelimit> = {};

function getLimiter(category: string, limit: number, window: Duration): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;

  if (!_limiters[category]) {
    _limiters[category] = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `rl:mw:${category}`,
      analytics: false,
    });
  }
  return _limiters[category];
}

// ---------------------------------------------------------------------------
// JWT payload decode (base64url, no signature verification — Edge safe)
// ---------------------------------------------------------------------------

function b64urlDecode(s: string): string {
  // base64url → base64: replace - with +, _ with /, add padding.
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  return pad ? padded + '='.repeat(4 - pad) : padded;
}

function decodeUid(req: NextRequest): string | null {
  const auth =
    req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;

  try {
    const parts = auth.slice(7).split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(b64urlDecode(parts[1]))) as Record<string, unknown>;
    if (typeof payload.user_id === 'string' && payload.user_id) return payload.user_id;
    if (typeof payload.sub === 'string' && payload.sub) return payload.sub;
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Request identifier (UID-first, IP fallback)
// ---------------------------------------------------------------------------

function getIdentifier(req: NextRequest): string {
  const uid = decodeUid(req);
  if (uid) return `uid:${uid}`;

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'anonymous';
  return `ip:${ip}`;
}

// ---------------------------------------------------------------------------
// Category routing — maps each request to a rate limit bucket
// ---------------------------------------------------------------------------

interface CategoryConfig {
  category: string;
  limit: number;
  window: Duration;
}

function getCategory(req: NextRequest): CategoryConfig {
  const { pathname, searchParams } = new URL(req.url);

  // Scan — highest sensitivity endpoint
  if (pathname === '/api/admin/scan-verify') {
    return { category: 'scan', limit: 30, window: '1 m' };
  }

  // Bulk action — lower than general mutations; high blast-radius operations
  if (pathname === '/api/admin/bulk-action') {
    return { category: 'bulk', limit: 30, window: '1 m' };
  }

  // Export / CSV endpoints (includes unified-dashboard?format=csv)
  if (
    pathname.startsWith('/api/admin/export/') ||
    /^\/api\/admin\/events\/[^/]+\/export$/.test(pathname) ||
    (pathname === '/api/admin/unified-dashboard' && searchParams.get('format') === 'csv')
  ) {
    return { category: 'export', limit: 10, window: '1 m' };
  }

  // Search — routes with a `q` query param
  if (searchParams.has('q')) {
    return { category: 'search', limit: 60, window: '1 m' };
  }

  // Mutation — POST / PUT / PATCH requests
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    return { category: 'mutation', limit: 60, window: '1 m' };
  }

  // Default — dashboard GET reads
  return { category: 'dashboard', limit: 100, window: '1 m' };
}

// ---------------------------------------------------------------------------
// Middleware handler
// ---------------------------------------------------------------------------

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { category, limit, window } = getCategory(req);
  const identifier = getIdentifier(req);
  const limiter = getLimiter(category, limit, window);

  // Redis not configured → pass through without rate limiting.
  if (!limiter) {
    return NextResponse.next();
  }

  try {
    const result = await limiter.limit(identifier);

    if (!result.success) {
      const retryAfterSecs = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
      console.warn(
        `[middleware] Rate limit EXCEEDED category=${category} id=${identifier} reset=${retryAfterSecs}s`
      );
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(result.limit),
            'X-RateLimit-Remaining': '0',
            'Retry-After': String(retryAfterSecs),
          },
        }
      );
    }

    // Pass through — attach rate limit info headers for observability.
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', String(result.limit));
    response.headers.set('X-RateLimit-Remaining', String(result.remaining));
    return response;
  } catch (err) {
    // Redis error → allow traffic rather than block legitimate users.
    console.error('[middleware] Rate limit error — allowing request through:', err);
    return NextResponse.next();
  }
}

// ---------------------------------------------------------------------------
// Matcher — apply only to admin API routes and pass-scanning endpoints
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    '/api/admin/:path*',
    '/api/passes/scan',
    '/api/passes/scan-member',
  ],
};
