import { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { activeSessions, users } from '@shared/schema';
import { eq, and, lt, desc, sql } from 'drizzle-orm';

// Simple user agent parser without external dependencies
function parseUserAgent(userAgent: string | undefined): {
  deviceType: string;
  browser: string;
  os: string;
} {
  if (!userAgent) {
    return { deviceType: 'Unknown', browser: 'Unknown', os: 'Unknown' };
  }

  const ua = userAgent.toLowerCase();

  // Detect device type
  let deviceType = 'Desktop';
  if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) {
    deviceType = 'Mobile';
  } else if (/ipad|tablet|playbook|silk/i.test(ua)) {
    deviceType = 'Tablet';
  }

  // Detect browser
  let browser = 'Unknown';
  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/opr|opera/i.test(ua)) browser = 'Opera';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/msie|trident/i.test(ua)) browser = 'Internet Explorer';

  // Detect OS
  let os = 'Unknown';
  if (/windows nt 10/i.test(ua)) os = 'Windows 10';
  else if (/windows nt 11/i.test(ua)) os = 'Windows 11';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac os x/i.test(ua)) os = 'MacOS';
  else if (/linux/i.test(ua) && !/android/i.test(ua)) os = 'Linux';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';

  return { deviceType, browser, os };
}

// Create a new session record on login
export async function createSessionRecord(
  sessionId: string,
  userId: string,
  req: Request,
  expiresAt: Date
): Promise<void> {
  try {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
    const { deviceType, browser, os } = parseUserAgent(userAgent);

    // Delete any existing session for this sessionId (shouldn't exist, but just in case)
    await db.delete(activeSessions).where(eq(activeSessions.sessionId, sessionId));

    // Insert new session record
    await db.insert(activeSessions).values({
      sessionId,
      userId,
      ipAddress,
      userAgent,
      deviceType,
      browser,
      os,
      loginAt: new Date(),
      lastActivity: new Date(),
      expiresAt,
      isActive: true,
    });

    console.log(`[SESSION TRACKER] Created session for user ${userId}`);
  } catch (error) {
    console.error('[SESSION TRACKER] Error creating session record:', error);
  }
}

// Update last activity timestamp
export async function updateSessionActivity(sessionId: string): Promise<void> {
  try {
    await db.update(activeSessions)
      .set({ lastActivity: new Date() })
      .where(eq(activeSessions.sessionId, sessionId));
  } catch (error) {
    // Silently fail - don't break the request
    console.error('[SESSION TRACKER] Error updating activity:', error);
  }
}

// Delete session record on logout
export async function deleteSessionRecord(sessionId: string): Promise<void> {
  try {
    await db.delete(activeSessions).where(eq(activeSessions.sessionId, sessionId));
    console.log(`[SESSION TRACKER] Deleted session ${sessionId}`);
  } catch (error) {
    console.error('[SESSION TRACKER] Error deleting session record:', error);
  }
}

// Delete all sessions for a user (for force logout)
export async function deleteUserSessions(userId: string): Promise<number> {
  try {
    const result = await db.delete(activeSessions)
      .where(eq(activeSessions.userId, userId))
      .returning();

    console.log(`[SESSION TRACKER] Deleted ${result.length} sessions for user ${userId}`);
    return result.length;
  } catch (error) {
    console.error('[SESSION TRACKER] Error deleting user sessions:', error);
    return 0;
  }
}

// Get all active sessions with user info
export async function getActiveSessions(): Promise<any[]> {
  try {
    const sessions = await db
      .select({
        id: activeSessions.id,
        sessionId: activeSessions.sessionId,
        userId: activeSessions.userId,
        ipAddress: activeSessions.ipAddress,
        userAgent: activeSessions.userAgent,
        deviceType: activeSessions.deviceType,
        browser: activeSessions.browser,
        os: activeSessions.os,
        location: activeSessions.location,
        loginAt: activeSessions.loginAt,
        lastActivity: activeSessions.lastActivity,
        expiresAt: activeSessions.expiresAt,
        isActive: activeSessions.isActive,
        userName: users.nom,
        userPrenom: users.prenom,
        userEmail: users.email,
        userRole: users.role,
        userAgence: users.agence,
      })
      .from(activeSessions)
      .leftJoin(users, eq(activeSessions.userId, users.id))
      .where(eq(activeSessions.isActive, true))
      .orderBy(desc(activeSessions.lastActivity));

    return sessions;
  } catch (error) {
    console.error('[SESSION TRACKER] Error getting active sessions:', error);
    return [];
  }
}

// Cleanup expired sessions
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const result = await db.delete(activeSessions)
      .where(lt(activeSessions.expiresAt, new Date()))
      .returning();

    if (result.length > 0) {
      console.log(`[SESSION TRACKER] Cleaned up ${result.length} expired sessions`);
    }
    return result.length;
  } catch (error) {
    console.error('[SESSION TRACKER] Error cleaning up sessions:', error);
    return 0;
  }
}

// Cleanup orphan sessions (users that no longer exist)
export async function cleanupOrphanSessions(): Promise<number> {
  try {
    // Delete sessions where userId is not found in users table
    // Using NOT EXISTS via SQL injection as Drizzle abstract construction for this widely varies
    const result = await db.execute(
      sql`DELETE FROM ${activeSessions} 
          WHERE ${activeSessions.userId} NOT IN (SELECT ${users.id} FROM ${users})
          RETURNING *`
    );

    const count = result.rows ? result.rows.length : 0;
    
    if (count > 0) {
      console.log(`[SESSION TRACKER] Cleaned up ${count} orphan sessions`);
    }
    return count;
  } catch (error) {
    console.error('[SESSION TRACKER] Error cleaning up orphan sessions:', error);
    return 0;
  }
}

// Middleware to track session activity (throttled to every 60 seconds)
const activityThrottleMap = new Map<string, number>();
const ACTIVITY_THROTTLE_MS = 60 * 1000; // 1 minute

export function sessionActivityMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only track authenticated requests
  if (!req.session?.userId || !req.sessionID) {
    return next();
  }

  const sessionId = req.sessionID;
  const now = Date.now();
  const lastUpdate = activityThrottleMap.get(sessionId) || 0;

  // Throttle updates to every 60 seconds
  if (now - lastUpdate > ACTIVITY_THROTTLE_MS) {
    activityThrottleMap.set(sessionId, now);
    // Fire and forget - don't await
    updateSessionActivity(sessionId).catch(() => {});
  }

  next();
}

// Schedule periodic cleanup
let cleanupScheduled = false;

export function scheduleSessionCleanup(): void {
  if (cleanupScheduled) return;
  cleanupScheduled = true;

  // Run cleanup every 5 minutes
  setInterval(async () => {
    await cleanupExpiredSessions();
    await cleanupOrphanSessions();
  }, 5 * 60 * 1000);

  // Run initial cleanup after 30 seconds
  setTimeout(async () => {
    await cleanupExpiredSessions();
    await cleanupOrphanSessions();
  }, 30 * 1000);

  console.log('[SESSION TRACKER] Cleanup scheduled every 5 minutes');
}
