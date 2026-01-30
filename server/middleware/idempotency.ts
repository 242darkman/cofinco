import type { Request, Response, NextFunction } from "express";

/**
 * Idempotency middleware with TTL-based response caching.
 *
 * When a client sends a request with an `idempotencyKey` (body or header),
 * the middleware ensures that:
 *   1. Concurrent duplicate requests are rejected (409)
 *   2. Completed responses are cached and replayed within the TTL window
 *   3. Cache entries auto-expire after TTL (default 5 minutes)
 *
 * Usage:
 *   app.post("/api/payments", idempotencyMiddleware("payment"), handler);
 */

interface CachedResponse {
  statusCode: number;
  body: any;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // Cleanup every minute
const MAX_CACHE_SIZE = 10000;

// TTL cache: key → cached response (completed requests)
const responseCache = new Map<string, CachedResponse>();

// In-flight tracker: key → true (requests currently being processed)
const processingKeys = new Set<string>();

// Periodic cleanup of expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of Array.from(responseCache.entries())) {
    if (entry.expiresAt <= now) {
      responseCache.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

export function idempotencyMiddleware(resourceType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey =
      req.body.idempotencyKey ||
      req.headers["x-idempotency-key"];

    if (!idempotencyKey) {
      return next();
    }

    const fullKey = `${resourceType}:${idempotencyKey}`;

    // 1. Check if we already have a cached response for this key
    const cached = responseCache.get(fullKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.status(cached.statusCode).json(cached.body);
    }

    // 2. Check if this key is currently being processed (concurrent duplicate)
    if (processingKeys.has(fullKey)) {
      return res.status(409).json({
        error: "DUPLICATE_REQUEST",
        message: "Cette operation est deja en cours de traitement",
      });
    }

    // 3. Mark as in-flight
    processingKeys.add(fullKey);

    // 4. Intercept the response to cache it
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      // Cache successful responses (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Evict oldest entries if cache is full
        if (responseCache.size >= MAX_CACHE_SIZE) {
          const firstKey = responseCache.keys().next().value;
          if (firstKey) responseCache.delete(firstKey);
        }

        responseCache.set(fullKey, {
          statusCode: res.statusCode,
          body,
          expiresAt: Date.now() + TTL_MS,
        });
      }

      // Remove from in-flight
      processingKeys.delete(fullKey);

      return originalJson(body);
    } as any;

    // 5. Also clean up on non-json responses (errors, etc.)
    res.on("finish", () => {
      processingKeys.delete(fullKey);
    });

    next();
  };
}
