/**
 * clientCache.ts
 *
 * Lightweight in-memory TTL cache for client-side API responses.
 * Lives as a module singleton in the browser tab — survives React
 * re-renders and component unmounts but is cleared on a full page reload.
 *
 * Purpose: prevent redundant Firestore reads (and rate-limit hits) when
 * multiple components mount in the same session or when the auto-refresh
 * interval fires but the data is already fresh.
 *
 * Default TTL: 10 minutes (600 000 ms) — aligns with the overview
 * auto-refresh interval so the API is never called more than once per
 * 10-minute window per cache key.
 *
 * Mutation routes (update-pass, bulk-action, etc.) should call
 * `invalidateCache(key)` so the next read fetches fresh data.
 */

export const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry<T> {
  data: T;
  storedAt: number; // Date.now() at write time
}

const _store = new Map<string, CacheEntry<unknown>>();

/**
 * Read a cached value.
 * Returns `null` if the entry is missing or older than `ttlMs`.
 */
export function getCache<T>(key: string, ttlMs = CACHE_TTL_MS): T | null {
  const entry = _store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.storedAt > ttlMs) {
    _store.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Write a value into the cache under `key`.
 */
export function setCache<T>(key: string, data: T): void {
  _store.set(key, { data, storedAt: Date.now() });
}

/**
 * Forcefully remove a cache entry so the next read hits the API.
 * Call this after any mutation that would change the cached data.
 */
export function invalidateCache(key: string): void {
  _store.delete(key);
}

/**
 * Remove all entries whose keys start with `prefix`.
 * Useful for invalidating a whole data domain (e.g. "payments").
 */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of _store.keys()) {
    if (key.startsWith(prefix)) _store.delete(key);
  }
}

/** How many seconds until a cached entry expires. Returns 0 if not cached. */
export function cacheAgeSeconds(key: string): number {
  const entry = _store.get(key);
  if (!entry) return 0;
  return Math.round((Date.now() - entry.storedAt) / 1000);
}
