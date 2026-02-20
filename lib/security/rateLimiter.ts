/**
 * rateLimiter.ts
 *
 * Drop-in replacement for the original in-memory rate limiter.
 * Now backed by Upstash Redis (distributed, safe for Vercel serverless).
 *
 * Existing call sites using checkRateLimit(req, { limit, windowMs }) work
 * without modification. Limiters are cached per (limit, windowMs) pair.
 *
 * Falls back to in-memory fixed-window when Redis is not configured or fails.
 */

import { Redis } from '@upstash/redis';
import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Redis singleton
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
// Limiter cache keyed by "limit_windowMs"
// ---------------------------------------------------------------------------

const _limiterCache = new Map<string, Ratelimit>();

function getDynamicLimiter(limit: number, windowMs: number): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;

  const cacheKey = `${limit}_${windowMs}`;
  const cached = _limiterCache.get(cacheKey);
  if (cached) return cached;

  // Convert windowMs → Duration string accepted by @upstash/ratelimit.
  // All current callers use windowMs: 60000 (60 s).
  const windowSecs = Math.max(1, Math.round(windowMs / 1000));
  const window = `${windowSecs} s` as Duration;

  const limiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(limit, window),
    // Prefix includes limit so bulk-action (30) and update-* (60) are separate buckets.
    prefix: `rl:legacy:${limit}`,
    analytics: false,
  });
  _limiterCache.set(cacheKey, limiter);
  return limiter;
}

// ---------------------------------------------------------------------------
// In-memory fallback (original implementation, used if Redis unavailable)
// ---------------------------------------------------------------------------

interface MemStore {
  count: number;
  resetTime: number;
}

const _memStore: Record<string, MemStore> = {};

function memRateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number } {
  const now = Date.now();
  const entry = _memStore[identifier];

  if (!entry || now > entry.resetTime) {
    _memStore[identifier] = { count: 1, resetTime: now + windowMs };
    return { success: true, remaining: limit - 1 };
  }

  entry.count++;
  if (entry.count > limit) return { success: false, remaining: 0 };
  return { success: true, remaining: limit - entry.count };
}

// ---------------------------------------------------------------------------
// Identifier extraction (UID-first, IP fallback) — Node.js runtime
// ---------------------------------------------------------------------------

function extractIdentifier(req: NextRequest): string {
  const authHeader =
    req.headers.get('Authorization') ?? req.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const parts = authHeader.slice(7).split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(
          Buffer.from(parts[1], 'base64url').toString('utf-8')
        ) as Record<string, unknown>;
        if (typeof payload.user_id === 'string' && payload.user_id) return `uid:${payload.user_id}`;
        if (typeof payload.sub === 'string' && payload.sub) return `uid:${payload.sub}`;
      }
    } catch {
      // Fall through.
    }
  }

  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'anonymous'
  );
}

// ---------------------------------------------------------------------------
// Public API (matches original signatures)
// ---------------------------------------------------------------------------

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export async function rateLimit(
  req: NextRequest,
  { limit, windowMs }: RateLimitOptions = { limit: 10, windowMs: 60000 }
): Promise<{ success: boolean; remaining: number }> {
  const identifier = extractIdentifier(req);
  const limiter = getDynamicLimiter(limit, windowMs);

  if (limiter) {
    try {
      const result = await limiter.limit(identifier);
      return { success: result.success, remaining: result.remaining };
    } catch {
      // Redis error → fall through to in-memory.
    }
  }

  return memRateLimit(identifier, limit, windowMs);
}

export async function checkRateLimit(
  req: NextRequest,
  options?: RateLimitOptions
): Promise<NextResponse | null> {
  const result = await rateLimit(req, options);

  if (!result.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((options?.windowMs ?? 60000) / 1000).toString(),
          'X-RateLimit-Limit': String(options?.limit ?? 10),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  return null;
}
