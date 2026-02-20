/**
 * adminRateLimiter.ts
 *
 * Distributed, per-organizer rate limiting backed by Upstash Redis.
 * Uses sliding window algorithm via @upstash/ratelimit.
 *
 * Designed for Next.js App Router route handlers (Node.js runtime).
 * Gracefully degrades to allow-all if Redis is unavailable.
 *
 * Key extraction order: Firebase UID (from JWT payload, no verification) → IP.
 * Full Firebase token verification still happens inside each route via requireOrganizer.
 */

import { Redis } from '@upstash/redis';
import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { type NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Redis singleton (lazy init)
// ---------------------------------------------------------------------------

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.warn('[adminRateLimiter] UPSTASH_REDIS_REST_URL / TOKEN not set — distributed rate limiting disabled');
    return null;
  }
  _redis = new Redis({ url, token });
  return _redis;
}

// ---------------------------------------------------------------------------
// Per-category configs (sliding window)
// ---------------------------------------------------------------------------

const CONFIGS = {
  /** POST /api/admin/scan-verify — highest sensitivity */
  scan: { requests: 30, window: '1 m' as Duration },
  /** GET /api/admin/* dashboard reads */
  dashboard: { requests: 100, window: '1 m' as Duration },
  /** CSV / export endpoints */
  export: { requests: 10, window: '1 m' as Duration },
  /** Routes with search / q param */
  search: { requests: 60, window: '1 m' as Duration },
  /** POST mutation routes */
  mutation: { requests: 60, window: '1 m' as Duration },
  /** Bulk action — lower volume, high blast-radius operations */
  bulk: { requests: 30, window: '1 m' as Duration },
} as const;

export type RateLimitCategory = keyof typeof CONFIGS;

// ---------------------------------------------------------------------------
// Limiter cache (one Ratelimit instance per category)
// ---------------------------------------------------------------------------

const _limiters = new Map<RateLimitCategory, Ratelimit>();

function getLimiter(category: RateLimitCategory): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;

  const cached = _limiters.get(category);
  if (cached) return cached;

  const { requests, window } = CONFIGS[category];
  const limiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `rl:admin:${category}`,
    analytics: false,
  });
  _limiters.set(category, limiter);
  return limiter;
}

// ---------------------------------------------------------------------------
// Identifier extraction (UID-first, IP fallback)
// ---------------------------------------------------------------------------

function extractIdentifier(req: NextRequest): string {
  // Attempt to pull Firebase UID from the JWT payload without signature verification.
  // Full verification is done inside each route by requireOrganizer / requireAdminRole.
  // Using UID as rate-limit key prevents IP-sharing false positives (shared NAT, proxies).
  const authHeader =
    req.headers.get('Authorization') ?? req.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const parts = token.split('.');
      if (parts.length === 3) {
        // Buffer is available in Node.js route handlers (not Edge middleware).
        const payload = JSON.parse(
          Buffer.from(parts[1], 'base64url').toString('utf-8')
        ) as Record<string, unknown>;

        if (typeof payload.user_id === 'string' && payload.user_id) {
          return `uid:${payload.user_id}`;
        }
        if (typeof payload.sub === 'string' && payload.sub) {
          return `uid:${payload.sub}`;
        }
      }
    } catch {
      // Fall through to IP.
    }
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'anonymous';
  return `ip:${ip}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  limited: boolean;
  limit: number;
  remaining: number;
  /** Milliseconds until the window resets. */
  resetAfterMs: number;
  /** The key used for rate limiting (uid:xxx or ip:xxx). */
  identifier: string;
}

/**
 * Check the rate limit for a given category and return the result.
 * Never throws — Redis errors degrade gracefully to allow-all.
 */
export async function rateLimitAdmin(
  req: NextRequest,
  category: RateLimitCategory
): Promise<RateLimitResult> {
  const config = CONFIGS[category];
  const identifier = extractIdentifier(req);
  const limiter = getLimiter(category);

  // Graceful degradation: Redis not configured → allow all traffic.
  if (!limiter) {
    return {
      limited: false,
      limit: config.requests,
      remaining: config.requests,
      resetAfterMs: 60_000,
      identifier,
    };
  }

  try {
    const result = await limiter.limit(identifier);

    if (!result.success) {
      console.warn(
        `[adminRateLimiter] EXCEEDED category=${category} id=${identifier} limit=${result.limit}`
      );
    }

    return {
      limited: !result.success,
      limit: result.limit,
      remaining: result.remaining,
      resetAfterMs: Math.max(0, result.reset - Date.now()),
      identifier,
    };
  } catch (err) {
    // Graceful degradation: Redis error → allow traffic rather than block legitimate users.
    console.error('[adminRateLimiter] Redis error — allowing request through:', err);
    return {
      limited: false,
      limit: config.requests,
      remaining: config.requests,
      resetAfterMs: 60_000,
      identifier,
    };
  }
}

/**
 * Build a 429 Response with standard rate-limit headers.
 * Call this when rateLimitAdmin returns { limited: true }.
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    { error: 'Too many requests. Please slow down.' },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
        'Retry-After': String(Math.max(1, Math.ceil(result.resetAfterMs / 1000))),
      },
    }
  );
}
