/**
 * CSRF Protection Middleware
 *
 * Uses Origin/Referer header validation (defense-in-depth alongside SameSite cookies).
 * Rejects cross-origin state-changing requests (POST/PUT/DELETE/PATCH) that don't
 * come from the application's own origin.
 *
 * Safe methods (GET, HEAD, OPTIONS) are always allowed.
 * Webhook endpoints are excluded (external providers).
 */

import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../lib/logger";

const logger = createLogger('Middleware:CSRF');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Paths exempt from CSRF checks (webhooks from external providers)
const EXEMPT_PATHS = [
  '/api/webhooks',
  '/api/health',
  '/api/metrics',
];

/**
 * Validates that the Origin or Referer header matches the expected host.
 * This prevents cross-site request forgery without requiring client-side tokens.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip safe methods (they should not cause state changes)
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Skip exempt paths (webhooks, health checks)
  if (EXEMPT_PATHS.some(path => req.path.startsWith(path))) {
    return next();
  }

  // Skip non-API routes (static assets, SPA)
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  // Get the request origin
  const origin = req.get('Origin');
  const referer = req.get('Referer');

  // If neither Origin nor Referer is present, this could be a direct API call
  // from a non-browser client (mobile app, Postman, cURL) — allow these
  if (!origin && !referer) {
    return next();
  }

  // Determine the expected host from the request
  const expectedHost = req.get('Host');
  if (!expectedHost) {
    return next(); // Can't validate without Host header
  }

  // Validate Origin header (preferred)
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === expectedHost) {
        return next();
      }
    } catch {
      // Invalid Origin header
    }

    logger.warn({
      origin,
      expectedHost,
      path: req.path,
      method: req.method,
      ip: req.ip,
    }, 'CSRF: Origin mismatch — request blocked');

    return res.status(403).json({ error: 'Requête cross-origin non autorisée' });
  }

  // Fallback to Referer validation
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host === expectedHost) {
        return next();
      }
    } catch {
      // Invalid Referer header
    }

    logger.warn({
      referer,
      expectedHost,
      path: req.path,
      method: req.method,
      ip: req.ip,
    }, 'CSRF: Referer mismatch — request blocked');

    return res.status(403).json({ error: 'Requête cross-origin non autorisée' });
  }

  return next();
}
