import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * ETag middleware for conditional requests.
 *
 * Generates ETag headers for GET responses and handles
 * If-None-Match headers to return 304 Not Modified when
 * the response hasn't changed, saving bandwidth.
 *
 * Only applies to JSON GET responses > 1KB.
 */
export function etagMiddleware() {
  return (_req: Request, res: Response, next: NextFunction) => {
    // Only intercept GET requests
    if (_req.method !== "GET") {
      return next();
    }

    const ifNoneMatch = _req.headers["if-none-match"];

    // Intercept res.json to add ETag
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      // Only add ETag to successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const bodyStr = JSON.stringify(body);

        // Only for responses > 1KB (worth the hashing cost)
        if (bodyStr.length > 1024) {
          const hash = crypto
            .createHash("md5")
            .update(bodyStr)
            .digest("hex");
          const etag = `"${hash}"`;

          res.setHeader("ETag", etag);

          // Check If-None-Match
          if (ifNoneMatch === etag) {
            return res.status(304).end();
          }
        }
      }

      return originalJson(body);
    } as any;

    next();
  };
}
