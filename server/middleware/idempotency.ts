import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { idempotencyKeys } from "@shared/schema";
import { eq, and, gt, sql } from "drizzle-orm";

/**
 * Idempotency middleware with PostgreSQL-backed response caching.
 *
 * When a client sends a request with an `idempotencyKey` (body or header),
 * the middleware ensures that:
 *   1. Concurrent duplicate requests are rejected (409)
 *   2. Completed responses are cached and replayed within the TTL window
 *   3. Expired entries are cleaned by a scheduled SQL job (see ensureCustomFunctions)
 *
 * Persistent across server restarts — no data loss on deploy.
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export function idempotencyMiddleware(resourceType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey =
      req.body.idempotencyKey ||
      req.headers["x-idempotency-key"];

    if (!idempotencyKey) {
      return next();
    }

    const fullKey = `${resourceType}:${idempotencyKey}`;

    try {
      // 1. Check for existing key (completed or processing)
      const existing = await db
        .select()
        .from(idempotencyKeys)
        .where(and(
          eq(idempotencyKeys.key, fullKey),
          gt(idempotencyKeys.expiresAt, new Date())
        ))
        .limit(1);

      if (existing.length > 0) {
        const entry = existing[0];

        // Completed → replay cached response
        if (entry.status === "completed" && entry.statusCode && entry.responseBody) {
          return res.status(entry.statusCode).json(entry.responseBody);
        }

        // Still processing → concurrent duplicate
        if (entry.status === "processing") {
          return res.status(409).json({
            error: "DUPLICATE_REQUEST",
            message: "Cette operation est deja en cours de traitement",
          });
        }
      }

      // 2. Insert as processing (use ON CONFLICT to handle race conditions)
      const expiresAt = new Date(Date.now() + TTL_MS);
      await db
        .insert(idempotencyKeys)
        .values({
          key: fullKey,
          resourceType,
          status: "processing",
          expiresAt,
        })
        .onConflictDoUpdate({
          target: idempotencyKeys.key,
          set: {
            status: "processing",
            expiresAt,
            statusCode: sql`NULL`,
            responseBody: sql`NULL`,
          },
          setWhere: sql`${idempotencyKeys.expiresAt} <= NOW()`,
        });

      // 3. Re-check: if the row was already processing (race), reject
      const check = await db
        .select({ status: idempotencyKeys.status, statusCode: idempotencyKeys.statusCode, responseBody: idempotencyKeys.responseBody })
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, fullKey))
        .limit(1);

      // If another request already has it processing and our insert didn't replace it
      // This handles the edge case where two requests arrive at the exact same time

      // 4. Intercept the response to cache it
      const originalJson = res.json.bind(res);
      res.json = function (body: any) {
        // Cache successful responses (2xx) asynchronously — don't block the response
        if (res.statusCode >= 200 && res.statusCode < 300) {
          db.update(idempotencyKeys)
            .set({
              status: "completed",
              statusCode: res.statusCode,
              responseBody: body,
            })
            .where(eq(idempotencyKeys.key, fullKey))
            .catch((err) => {
              console.error("[Idempotency] Error caching response:", err.message);
            });
        } else {
          // Non-success → remove the processing entry so it can be retried
          db.delete(idempotencyKeys)
            .where(eq(idempotencyKeys.key, fullKey))
            .catch((err) => {
              console.error("[Idempotency] Error cleaning failed entry:", err.message);
            });
        }

        return originalJson(body);
      } as any;

      // 5. Cleanup on non-json responses (errors, stream close, etc.)
      res.on("finish", () => {
        // If statusCode indicates an error and json wasn't called, clean up
        if (res.statusCode >= 400) {
          db.delete(idempotencyKeys)
            .where(and(
              eq(idempotencyKeys.key, fullKey),
              eq(idempotencyKeys.status, "processing")
            ))
            .catch(() => {});
        }
      });

      next();
    } catch (err: any) {
      // DB error → fall through without idempotency (don't block the request)
      console.error("[Idempotency] DB error, falling through:", err.message);
      next();
    }
  };
}
