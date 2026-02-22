/**
 * Critical Permission Patterns — DB-backed loader with cache
 *
 * Loads critical permission patterns from the `criticalPermissionPatterns` table
 * and caches them for 5 minutes. Falls back to DEFAULT_CRITICAL_PATTERNS on error.
 */

import { db } from '../db';
import { eq } from 'drizzle-orm';
import {
  criticalPermissionPatterns,
  DEFAULT_CRITICAL_PATTERNS,
  isCriticalPermission,
} from '@shared/schema';
import { createLogger } from '../lib/logger';

const logger = createLogger('CriticalPatterns');

let cachedPatterns: string[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load active critical permission patterns from DB.
 * Returns cached value if within TTL; falls back to DEFAULT_CRITICAL_PATTERNS on error.
 */
export async function loadCriticalPatterns(): Promise<string[]> {
  const now = Date.now();
  if (cachedPatterns && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedPatterns;
  }

  try {
    const rows = await db
      .select({ pattern: criticalPermissionPatterns.pattern })
      .from(criticalPermissionPatterns)
      .where(eq(criticalPermissionPatterns.requireReason, true));

    if (rows.length === 0) {
      cachedPatterns = [...DEFAULT_CRITICAL_PATTERNS];
    } else {
      cachedPatterns = rows.map(r => r.pattern);
    }
    cacheTimestamp = now;
    return cachedPatterns;
  } catch (error) {
    logger.error({ err: error }, 'Failed to load critical patterns from DB, using defaults');
    return [...DEFAULT_CRITICAL_PATTERNS];
  }
}

/**
 * Check if a permission code is critical using DB-stored patterns.
 * Async — requires DB access (cached).
 */
export async function isCriticalPermissionFromDb(permissionCode: string): Promise<boolean> {
  const patterns = await loadCriticalPatterns();
  return isCriticalPermission(permissionCode, patterns);
}

/**
 * Invalidate the critical patterns cache (e.g. after admin updates patterns).
 */
export function invalidateCriticalPatternsCache(): void {
  cachedPatterns = null;
  cacheTimestamp = 0;
}
