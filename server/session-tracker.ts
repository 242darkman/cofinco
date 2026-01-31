import { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { activeSessions, users, userAgences, agences, userRoles } from '@shared/schema';
import { SystemRole } from '@shared/types/roles';
import { eq, and, lt, desc, sql, isNull } from 'drizzle-orm';
import { createLogger } from './lib/logger';

const logger = createLogger('SessionTracker');

// ============================================
// IP CHANGE DETECTION
// ============================================

/**
 * Configuration pour la détection de changement d'IP
 */
const IP_CHANGE_CONFIG = {
  // Niveau de sensibilité (1 = très sensible, 3 = tolérant)
  // 1: Tout changement invalide la session
  // 2: Changement de sous-réseau /24 invalide la session
  // 3: Changement de classe B /16 invalide la session
  SENSITIVITY_LEVEL: 2,

  // Permet d'exclure certaines IPs de la vérification (ex: VPN connu)
  EXCLUDED_IPS: ['127.0.0.1', '::1', 'localhost'],

  // Cache de vérification IP pour éviter trop de logs
  CHECK_CACHE_MS: 60 * 1000, // 1 minute
};

// Cache pour éviter les vérifications répétées
const ipCheckCache = new Map<string, { ip: string; timestamp: number }>();

/**
 * Parse une adresse IP en segments
 * Gère IPv4, IPv6 et les formats proxy (x-forwarded-for)
 */
function parseIpAddress(ip: string | undefined): { segments: number[]; isIPv4: boolean; raw: string } {
  if (!ip) return { segments: [], isIPv4: true, raw: 'unknown' };

  // Nettoyer l'IP (enlever préfixes IPv6-mapped IPv4, port, etc.)
  let cleanIp = ip.trim();

  // Gérer x-forwarded-for (prendre la première IP)
  if (cleanIp.includes(',')) {
    cleanIp = cleanIp.split(',')[0].trim();
  }

  // Enlever le préfixe ::ffff: pour IPv4-mapped IPv6
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.substring(7);
  }

  // Vérifier si c'est une IPv4
  const ipv4Match = cleanIp.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    return {
      segments: ipv4Match.slice(1).map(Number),
      isIPv4: true,
      raw: cleanIp,
    };
  }

  // Pour IPv6, on garde les 4 premiers segments
  const ipv6Parts = cleanIp.split(':').filter(p => p).slice(0, 4);
  if (ipv6Parts.length > 0) {
    return {
      segments: ipv6Parts.map(p => parseInt(p, 16) || 0),
      isIPv4: false,
      raw: cleanIp,
    };
  }

  return { segments: [], isIPv4: true, raw: cleanIp };
}

/**
 * Compare deux adresses IP et détermine si le changement est significatif
 * @returns true si les IPs sont compatibles (pas de changement significatif)
 */
export function areIpsCompatible(originalIp: string | undefined | null, currentIp: string | undefined): boolean {
  if (!originalIp || !currentIp) return true;

  // Exclure les IPs locales de la vérification
  if (IP_CHANGE_CONFIG.EXCLUDED_IPS.includes(originalIp) ||
      IP_CHANGE_CONFIG.EXCLUDED_IPS.includes(currentIp)) {
    return true;
  }

  const original = parseIpAddress(originalIp);
  const current = parseIpAddress(currentIp);

  // IPs identiques
  if (original.raw === current.raw) return true;

  // Types différents (IPv4 vs IPv6) - considérer comme changement significatif
  if (original.isIPv4 !== current.isIPv4) {
    logger.debug({ originalIp, currentIp }, 'IP type mismatch (IPv4/IPv6)');
    return false;
  }

  // Pas assez de segments pour comparer
  if (original.segments.length === 0 || current.segments.length === 0) {
    return true;
  }

  // Comparaison selon le niveau de sensibilité
  switch (IP_CHANGE_CONFIG.SENSITIVITY_LEVEL) {
    case 1:
      // Très sensible: tout changement est significatif
      return original.raw === current.raw;

    case 2:
      // Moyen: même sous-réseau /24 (IPv4) ou /48 (IPv6)
      if (original.isIPv4) {
        // Comparer les 3 premiers octets
        return original.segments[0] === current.segments[0] &&
               original.segments[1] === current.segments[1] &&
               original.segments[2] === current.segments[2];
      } else {
        // IPv6: comparer les 3 premiers segments
        return original.segments[0] === current.segments[0] &&
               original.segments[1] === current.segments[1] &&
               original.segments[2] === current.segments[2];
      }

    case 3:
    default:
      // Tolérant: même classe B /16 (IPv4) ou /32 (IPv6)
      if (original.isIPv4) {
        return original.segments[0] === current.segments[0] &&
               original.segments[1] === current.segments[1];
      } else {
        return original.segments[0] === current.segments[0] &&
               original.segments[1] === current.segments[1];
      }
  }
}

/**
 * Vérifie si l'IP de la requête a changé de manière significative
 * par rapport à l'IP enregistrée pour la session
 */
export async function checkIpChange(sessionId: string, currentIp: string): Promise<{
  changed: boolean;
  originalIp: string | null;
  currentIp: string;
  reason?: string;
}> {
  // Vérifier le cache
  const cached = ipCheckCache.get(sessionId);
  const now = Date.now();
  if (cached && (now - cached.timestamp) < IP_CHANGE_CONFIG.CHECK_CACHE_MS) {
    // Utiliser le cache si l'IP n'a pas changé depuis la dernière vérification
    if (cached.ip === currentIp) {
      return { changed: false, originalIp: null, currentIp };
    }
  }

  try {
    const [session] = await db.select({
      ipAddress: activeSessions.ipAddress,
      userId: activeSessions.userId,
    })
    .from(activeSessions)
    .where(eq(activeSessions.sessionId, sessionId));

    if (!session) {
      return { changed: false, originalIp: null, currentIp };
    }

    // Mettre à jour le cache
    ipCheckCache.set(sessionId, { ip: currentIp, timestamp: now });

    const isCompatible = areIpsCompatible(session.ipAddress, currentIp);

    if (!isCompatible) {
      logger.warn({
        sessionId,
        originalIp: session.ipAddress,
        currentIp,
        userId: session.userId,
      }, 'Significant IP change detected');

      return {
        changed: true,
        originalIp: session.ipAddress,
        currentIp,
        reason: `IP changée de ${session.ipAddress} vers ${currentIp}`,
      };
    }

    return { changed: false, originalIp: session.ipAddress, currentIp };
  } catch (error) {
    logger.error({ err: error }, 'Error checking IP change');
    // En cas d'erreur, ne pas bloquer
    return { changed: false, originalIp: null, currentIp };
  }
}

/**
 * Nettoie le cache de vérification IP
 * Appelé périodiquement pour éviter les fuites mémoire
 */
export function cleanupIpCheckCache(): void {
  const now = Date.now();
  const maxAge = IP_CHANGE_CONFIG.CHECK_CACHE_MS * 10; // 10 minutes

  for (const [sessionId, data] of ipCheckCache.entries()) {
    if ((now - data.timestamp) > maxAge) {
      ipCheckCache.delete(sessionId);
    }
  }
}

// ============================================
// DEVICE FINGERPRINT VERIFICATION
// ============================================

/**
 * Configuration pour la vérification du fingerprint
 */
const FINGERPRINT_CONFIG = {
  // Mode de vérification
  // 'strict': Le fingerprint complet doit correspondre exactement
  // 'tolerant': Le fingerprint partiel doit correspondre (permet mises à jour mineures du navigateur)
  // 'disabled': Pas de vérification (fingerprint stocké mais non vérifié)
  VERIFICATION_MODE: 'tolerant' as 'strict' | 'tolerant' | 'disabled',

  // Cache de vérification pour éviter trop de requêtes DB
  CHECK_CACHE_MS: 60 * 1000, // 1 minute
};

// Cache de vérification fingerprint
const fingerprintCheckCache = new Map<string, { fingerprint: string; timestamp: number; valid: boolean }>();

/**
 * Vérifie si le fingerprint de la requête correspond à celui enregistré pour la session
 * @returns Object avec le résultat de la vérification
 */
export async function checkDeviceFingerprint(
  sessionId: string,
  currentFingerprint: string | undefined,
  currentFingerprintPartial: string | undefined
): Promise<{
  valid: boolean;
  reason?: string;
  storedFingerprint?: string | null;
}> {
  // Si pas de fingerprint fourni, on laisse passer (rétrocompatibilité)
  if (!currentFingerprint) {
    return { valid: true };
  }

  // Vérification désactivée
  if (FINGERPRINT_CONFIG.VERIFICATION_MODE === 'disabled') {
    return { valid: true };
  }

  // Vérifier le cache
  const cached = fingerprintCheckCache.get(sessionId);
  const now = Date.now();
  if (cached && (now - cached.timestamp) < FINGERPRINT_CONFIG.CHECK_CACHE_MS) {
    if (cached.fingerprint === currentFingerprint && cached.valid) {
      return { valid: true };
    }
  }

  try {
    const [session] = await db.select({
      deviceFingerprint: activeSessions.deviceFingerprint,
      deviceFingerprintPartial: activeSessions.deviceFingerprintPartial,
      userId: activeSessions.userId,
    })
    .from(activeSessions)
    .where(eq(activeSessions.sessionId, sessionId));

    if (!session) {
      return { valid: true }; // Session non trouvée - sera gérée par isSessionValid
    }

    // Pas de fingerprint stocké (session créée avant l'implémentation)
    if (!session.deviceFingerprint) {
      return { valid: true };
    }

    // Vérification selon le mode
    let isValid = false;

    if (FINGERPRINT_CONFIG.VERIFICATION_MODE === 'strict') {
      // Mode strict: le fingerprint complet doit correspondre
      isValid = session.deviceFingerprint === currentFingerprint;
    } else {
      // Mode tolérant: le fingerprint partiel peut correspondre
      // Cela permet les mises à jour mineures du navigateur
      isValid = session.deviceFingerprint === currentFingerprint ||
                (session.deviceFingerprintPartial && currentFingerprintPartial &&
                 session.deviceFingerprintPartial === currentFingerprintPartial);
    }

    // Mettre à jour le cache
    fingerprintCheckCache.set(sessionId, {
      fingerprint: currentFingerprint,
      timestamp: now,
      valid: isValid,
    });

    if (!isValid) {
      logger.warn({
        sessionId,
        userId: session.userId,
        storedFingerprint: session.deviceFingerprint?.substring(0, 8) + '...',
        currentFingerprint: currentFingerprint?.substring(0, 8) + '...',
        mode: FINGERPRINT_CONFIG.VERIFICATION_MODE,
      }, 'Device fingerprint mismatch detected - possible stolen cookie');

      return {
        valid: false,
        reason: 'Device fingerprint mismatch - session may have been hijacked',
        storedFingerprint: session.deviceFingerprint,
      };
    }

    return { valid: true };
  } catch (error) {
    logger.error({ err: error }, 'Error checking device fingerprint');
    // En cas d'erreur, ne pas bloquer (fail-open pour éviter les faux positifs)
    return { valid: true };
  }
}

/**
 * Nettoie le cache de vérification fingerprint
 */
export function cleanupFingerprintCheckCache(): void {
  const now = Date.now();
  const maxAge = FINGERPRINT_CONFIG.CHECK_CACHE_MS * 10;

  for (const [sessionId, data] of fingerprintCheckCache.entries()) {
    if ((now - data.timestamp) > maxAge) {
      fingerprintCheckCache.delete(sessionId);
    }
  }
}

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
  expiresAt: Date,
  deviceFingerprint?: string,
  deviceFingerprintPartial?: string
): Promise<void> {
  try {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
    const { deviceType, browser, os } = parseUserAgent(userAgent);

    // Delete any existing session for this sessionId (shouldn't exist, but just in case)
    await db.delete(activeSessions).where(eq(activeSessions.sessionId, sessionId));

    // Insert new session record with device fingerprint
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
      deviceFingerprint: deviceFingerprint || null,
      deviceFingerprintPartial: deviceFingerprintPartial || null,
    });

    logger.info({ userId, hasFingerprint: !!deviceFingerprint }, 'Created session for user');
  } catch (error) {
    logger.error({ err: error }, 'Error creating session record');
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
    logger.error({ err: error }, 'Error updating activity');
  }
}

// Delete session record on logout
export async function deleteSessionRecord(sessionId: string): Promise<void> {
  try {
    await db.delete(activeSessions).where(eq(activeSessions.sessionId, sessionId));
    logger.info({ sessionId }, 'Deleted session');
  } catch (error) {
    logger.error({ err: error }, 'Error deleting session record');
  }
}

// Delete all sessions for a user (for force logout)
export async function deleteUserSessions(userId: string): Promise<number> {
  try {
    const result = await db.delete(activeSessions)
      .where(eq(activeSessions.userId, userId))
      .returning();

    logger.info({ userId, count: result.length }, 'Deleted sessions for user');
    return result.length;
  } catch (error) {
    logger.error({ err: error }, 'Error deleting user sessions');
    return 0;
  }
}

// ============================================
// SESSION LIMITS
// ============================================

const MAX_SESSIONS_PER_USER = 3;

/**
 * Count active sessions for a user
 */
export async function countUserSessions(userId: string): Promise<number> {
  try {
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(activeSessions)
      .where(and(
        eq(activeSessions.userId, userId),
        eq(activeSessions.isActive, true)
      ));
    return Number(result?.count || 0);
  } catch (error) {
    logger.error({ err: error, userId }, 'Error counting user sessions');
    return 0;
  }
}

/**
 * Get user's active sessions ordered by login time (oldest first)
 */
export async function getUserSessions(userId: string): Promise<{
  id: string;
  sessionId: string;
  loginAt: Date;
  lastActivity: Date;
  deviceType: string;
  browser: string;
  ipAddress: string;
}[]> {
  try {
    const sessions = await db.select({
      id: activeSessions.id,
      sessionId: activeSessions.sessionId,
      loginAt: activeSessions.loginAt,
      lastActivity: activeSessions.lastActivity,
      deviceType: activeSessions.deviceType,
      browser: activeSessions.browser,
      ipAddress: activeSessions.ipAddress,
    })
    .from(activeSessions)
    .where(and(
      eq(activeSessions.userId, userId),
      eq(activeSessions.isActive, true)
    ))
    .orderBy(activeSessions.loginAt);

    return sessions;
  } catch (error) {
    logger.error({ err: error, userId }, 'Error getting user sessions');
    return [];
  }
}

/**
 * Enforce session limit for a user.
 * If user has MAX_SESSIONS_PER_USER or more active sessions,
 * terminates the oldest session(s) to make room for a new one.
 *
 * @returns Object with terminated session info (if any)
 */
export async function enforceSessionLimit(userId: string): Promise<{
  limitReached: boolean;
  sessionsTerminated: number;
  terminatedSessions: { sessionId: string; deviceType: string; browser: string }[];
}> {
  try {
    const sessionCount = await countUserSessions(userId);

    if (sessionCount < MAX_SESSIONS_PER_USER) {
      return { limitReached: false, sessionsTerminated: 0, terminatedSessions: [] };
    }

    // Get sessions ordered by oldest first
    const sessions = await getUserSessions(userId);

    // Calculate how many to terminate (keep MAX - 1 to make room for new session)
    const toTerminate = sessions.slice(0, sessionCount - MAX_SESSIONS_PER_USER + 1);
    const terminatedSessions: { sessionId: string; deviceType: string; browser: string }[] = [];

    for (const session of toTerminate) {
      // Mark as inactive
      await db.update(activeSessions)
        .set({ isActive: false })
        .where(eq(activeSessions.id, session.id));

      terminatedSessions.push({
        sessionId: session.sessionId,
        deviceType: session.deviceType,
        browser: session.browser,
      });

      // Notify via WebSocket
      try {
        const { getWsInstance } = await import('./ws-server');
        const ws = getWsInstance();
        if (ws) {
          ws.sendToUser(userId, {
            type: 'SESSION_INVALID',
            payload: {
              reason: 'session_limit_reached',
              message: 'Vous avez atteint la limite de sessions. Cette session a été fermée car vous vous êtes connecté ailleurs.',
              sessionId: session.sessionId,
            }
          });
        }
      } catch {
        // WebSocket notification is best-effort
      }
    }

    logger.info({
      userId,
      sessionCount,
      terminated: terminatedSessions.length,
      maxAllowed: MAX_SESSIONS_PER_USER,
    }, 'Enforced session limit - terminated oldest sessions');

    return {
      limitReached: true,
      sessionsTerminated: terminatedSessions.length,
      terminatedSessions,
    };
  } catch (error) {
    logger.error({ err: error, userId }, 'Error enforcing session limit');
    return { limitReached: false, sessionsTerminated: 0, terminatedSessions: [] };
  }
}

/**
 * Get the maximum allowed sessions per user
 */
export function getMaxSessionsPerUser(): number {
  return MAX_SESSIONS_PER_USER;
}

// Get all active sessions with user info
export async function getActiveSessions(): Promise<any[]> {
  try {
    // Query sessions with user data (Architecture V3: rôle uniquement via userRoles)
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
        // Rôle uniquement via userRoles (Architecture V3)
        userRole: userRoles.role,
        userAgence: agences.nom,
      })
      .from(activeSessions)
      .leftJoin(users, eq(activeSessions.userId, users.id))
      .leftJoin(userRoles, and(
        eq(userRoles.userId, activeSessions.userId),
        eq(userRoles.isPrimary, true)
      ))
      .leftJoin(userAgences, and(
        eq(userAgences.userId, users.id),
        eq(userAgences.isPrimary, true),
        eq(userAgences.actif, true)
      ))
      .leftJoin(agences, eq(userAgences.agenceId, agences.id))
      .where(eq(activeSessions.isActive, true))
      .orderBy(desc(activeSessions.lastActivity));

    // Si pas de rôle dans userRoles, fallback vers CLIENT (Architecture V3: plus de employes.roleSystem)
    return sessions.map((s) => ({
      ...s,
      userRole: s.userRole || SystemRole.CLIENT,
    }));
  } catch (error) {
    logger.error({ err: error }, 'Error getting active sessions');
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
      logger.info({ count: result.length }, 'Cleaned up expired sessions');
    }
    return result.length;
  } catch (error) {
    logger.error({ err: error }, 'Error cleaning up sessions');
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
      logger.info({ count }, 'Cleaned up orphan sessions');
    }
    return count;
  } catch (error) {
    logger.error({ err: error }, 'Error cleaning up orphan sessions');
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

// Check if a session is still valid (exists and is active)
// Cache pour les sessions validées (évite les appels DB répétés)
// TTL: 30 secondes - balance entre performance et sécurité
const sessionValidityCache = new Map<string, { valid: boolean; timestamp: number }>();
const SESSION_CACHE_TTL_MS = 30000; // 30 secondes

export async function isSessionValid(sessionId: string): Promise<{ valid: boolean; reason?: string }> {
  // Vérifier le cache d'abord
  const cached = sessionValidityCache.get(sessionId);
  if (cached && Date.now() - cached.timestamp < SESSION_CACHE_TTL_MS) {
    if (cached.valid) {
      return { valid: true };
    }
    // Si invalide en cache, re-vérifier (l'utilisateur peut s'être reconnecté)
  }

  try {
    const [session] = await db.select({
      isActive: activeSessions.isActive,
      expiresAt: activeSessions.expiresAt,
      userId: activeSessions.userId,
    })
    .from(activeSessions)
    .where(eq(activeSessions.sessionId, sessionId));

    if (!session) {
      return { valid: false, reason: 'session_not_found' };
    }

    if (!session.isActive) {
      sessionValidityCache.set(sessionId, { valid: false, timestamp: Date.now() });
      return { valid: false, reason: 'session_inactive' };
    }

    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      sessionValidityCache.set(sessionId, { valid: false, timestamp: Date.now() });
      return { valid: false, reason: 'session_expired' };
    }

    // Check if user can still login
    const [user] = await db.select({
      canLogin: users.canLogin,
      statut: users.statut,
    })
    .from(users)
    .where(eq(users.id, session.userId));

    if (!user) {
      return { valid: false, reason: 'user_not_found' };
    }

    if (!user.canLogin) {
      sessionValidityCache.set(sessionId, { valid: false, timestamp: Date.now() });
      return { valid: false, reason: 'user_login_disabled' };
    }

    if (user.statut !== 'ACTIVE') {
      sessionValidityCache.set(sessionId, { valid: false, timestamp: Date.now() });
      return { valid: false, reason: 'user_inactive' };
    }

    // Session valide - mettre en cache
    sessionValidityCache.set(sessionId, { valid: true, timestamp: Date.now() });
    return { valid: true };
  } catch (error) {
    logger.error({ err: error }, 'Error checking session validity');

    // AMÉLIORATION: En cas d'erreur DB temporaire, utiliser le cache si disponible
    // Cela évite les déconnexions lors de problèmes DB transitoires
    const cachedResult = sessionValidityCache.get(sessionId);
    if (cachedResult && Date.now() - cachedResult.timestamp < SESSION_CACHE_TTL_MS * 3) {
      logger.warn({ sessionId }, 'Using cached session validity due to DB error');
      return { valid: cachedResult.valid, reason: cachedResult.valid ? undefined : 'cached_invalid' };
    }

    // Pas de cache - assumer valide pour éviter une déconnexion
    // (la sécurité est assurée par le cookie de session httpOnly)
    logger.warn({ sessionId }, 'DB error during session check - assuming valid to avoid disruption');
    return { valid: true, reason: 'db_error_graceful' };
  }
}

// Nettoyer le cache périodiquement
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of sessionValidityCache.entries()) {
    if (now - value.timestamp > SESSION_CACHE_TTL_MS * 3) {
      sessionValidityCache.delete(key);
    }
  }
}, 60000); // Toutes les minutes

// Mark a session as inactive (soft invalidation)
export async function markSessionInactive(sessionId: string, reason?: string): Promise<void> {
  try {
    await db.update(activeSessions)
      .set({ isActive: false })
      .where(eq(activeSessions.sessionId, sessionId));

    // Invalider le cache
    sessionValidityCache.delete(sessionId);

    logger.info({ sessionId, reason }, 'Marked session as inactive');
  } catch (error) {
    logger.error({ err: error }, 'Error marking session inactive');
  }
}

// Mark all sessions for a user as inactive
export async function markUserSessionsInactive(userId: string, reason?: string): Promise<number> {
  try {
    const result = await db.update(activeSessions)
      .set({ isActive: false })
      .where(and(eq(activeSessions.userId, userId), eq(activeSessions.isActive, true)))
      .returning();

    logger.info({ userId, count: result.length, reason }, 'Marked sessions as inactive for user');
    return result.length;
  } catch (error) {
    logger.error({ err: error }, 'Error marking user sessions inactive');
    return 0;
  }
}

/**
 * Session Guard Middleware
 * Validates that the session is still active in the database.
 * Also checks for significant IP changes and device fingerprint (security features).
 * If the session is invalid, destroys it and returns 401.
 *
 * Use this middleware after requireAuth for critical routes.
 */
export async function sessionGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session?.userId || !req.sessionID) {
    res.status(401).json({ message: 'No active session', code: 'SESSION_REQUIRED' });
    return;
  }

  const validity = await isSessionValid(req.sessionID);

  if (!validity.valid) {
    logger.info({ sessionId: req.sessionID, reason: validity.reason }, 'Invalid session detected');

    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        logger.error({ err }, 'Error destroying session');
      }
    });

    res.status(401).json({
      message: 'Session invalidated',
      code: 'SESSION_INVALID',
      reason: validity.reason
    });
    return;
  }

  // ========================================
  // IP Change Detection
  // ========================================
  const currentIp = req.ip || req.connection?.remoteAddress || 'unknown';
  const ipCheck = await checkIpChange(req.sessionID, currentIp);

  if (ipCheck.changed) {
    logger.warn({
      sessionId: req.sessionID,
      userId: req.session.userId,
      originalIp: ipCheck.originalIp,
      currentIp: ipCheck.currentIp,
    }, 'Session invalidated due to significant IP change');

    // Mark session as inactive
    await markSessionInactive(req.sessionID, 'ip_change');

    // Notify via WebSocket
    try {
      const { getWsInstance } = await import('./ws-server');
      const ws = getWsInstance();
      if (ws) {
        ws.sendToUser(req.session.userId, {
          type: 'SESSION_INVALID',
          payload: {
            reason: 'ip_change',
            message: `Votre session a été invalidée car votre adresse IP a changé de manière significative (${ipCheck.originalIp} → ${ipCheck.currentIp}). Pour des raisons de sécurité, veuillez vous reconnecter.`,
            sessionId: req.sessionID,
          }
        });
      }
    } catch {
      // WebSocket notification is best-effort
    }

    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        logger.error({ err }, 'Error destroying session');
      }
    });

    res.status(401).json({
      message: 'Session invalidée pour raison de sécurité',
      code: 'IP_CHANGE_DETECTED',
      reason: ipCheck.reason,
      details: {
        originalIp: ipCheck.originalIp,
        currentIp: ipCheck.currentIp,
      }
    });
    return;
  }

  // ========================================
  // Device Fingerprint Verification
  // ========================================
  const currentFingerprint = req.headers['x-device-fingerprint'] as string | undefined;
  const currentFingerprintPartial = req.headers['x-device-fingerprint-partial'] as string | undefined;

  const fingerprintCheck = await checkDeviceFingerprint(
    req.sessionID,
    currentFingerprint,
    currentFingerprintPartial
  );

  if (!fingerprintCheck.valid) {
    logger.warn({
      sessionId: req.sessionID,
      userId: req.session.userId,
      reason: fingerprintCheck.reason,
    }, 'Session invalidated due to device fingerprint mismatch');

    // Mark session as inactive
    await markSessionInactive(req.sessionID, 'fingerprint_mismatch');

    // Notify via WebSocket
    try {
      const { getWsInstance } = await import('./ws-server');
      const ws = getWsInstance();
      if (ws) {
        ws.sendToUser(req.session.userId, {
          type: 'SESSION_INVALID',
          payload: {
            reason: 'fingerprint_mismatch',
            message: 'Votre session a été invalidée car elle semble être utilisée depuis un appareil différent. Pour des raisons de sécurité, veuillez vous reconnecter.',
            sessionId: req.sessionID,
          }
        });
      }
    } catch {
      // WebSocket notification is best-effort
    }

    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        logger.error({ err }, 'Error destroying session');
      }
    });

    res.status(401).json({
      message: 'Session invalidée - appareil non reconnu',
      code: 'FINGERPRINT_MISMATCH',
      reason: 'Device fingerprint does not match the original device',
    });
    return;
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
    await markExpiredSessionsInactive();
    // Detect and invalidate stale sessions (client unresponsive)
    await invalidateStaleSessions();
    // Clean up IP check cache
    cleanupIpCheckCache();
    // Clean up fingerprint check cache
    cleanupFingerprintCheckCache();
    // Clean up expired refresh tokens (remember-me)
    try {
      const { cleanupExpiredTokens } = await import('./services/refresh-token-service');
      await cleanupExpiredTokens();
    } catch {
      // Refresh token service might not be loaded yet
    }
  }, 5 * 60 * 1000);

  // Run stale session check more frequently (every 2 minutes)
  // This ensures faster detection of frozen/crashed clients
  setInterval(async () => {
    await invalidateStaleSessions();
  }, 2 * 60 * 1000);

  // Run initial cleanup after 30 seconds
  setTimeout(async () => {
    await cleanupExpiredSessions();
    await cleanupOrphanSessions();
    await markExpiredSessionsInactive();
  }, 30 * 1000);

  logger.info('Cleanup scheduled: full every 5 min, stale detection every 2 min, IP/fingerprint cache cleanup, refresh token cleanup');
}

// Mark expired sessions as inactive (before deletion)
async function markExpiredSessionsInactive(): Promise<number> {
  try {
    const result = await db.update(activeSessions)
      .set({ isActive: false })
      .where(and(
        lt(activeSessions.expiresAt, new Date()),
        eq(activeSessions.isActive, true)
      ))
      .returning();

    if (result.length > 0) {
      logger.info({ count: result.length }, 'Marked expired sessions as inactive');
    }
    return result.length;
  } catch (error) {
    logger.error({ err: error }, 'Error marking expired sessions inactive');
    return 0;
  }
}

/**
 * Détecte et invalide les sessions "mortes" - où le client n'a fait aucune requête
 * depuis un certain temps (frontend gelé, crash, laptop fermé, etc.)
 *
 * Seuil: 5 minutes sans activité = session invalide
 * (le heartbeat client est de 30s-60s, donc 5 min = client définitivement mort)
 */
const STALE_SESSION_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export async function invalidateStaleSessions(): Promise<{ count: number; userIds: string[] }> {
  try {
    const staleThreshold = new Date(Date.now() - STALE_SESSION_THRESHOLD_MS);

    // Find sessions where lastActivity is older than threshold
    const staleSessions = await db.select({
      id: activeSessions.id,
      userId: activeSessions.userId,
      sessionId: activeSessions.sessionId,
      lastActivity: activeSessions.lastActivity,
    })
    .from(activeSessions)
    .where(and(
      lt(activeSessions.lastActivity, staleThreshold),
      eq(activeSessions.isActive, true)
    ));

    if (staleSessions.length === 0) {
      return { count: 0, userIds: [] };
    }

    const userIds = staleSessions.map(s => s.userId);
    const sessionIds = staleSessions.map(s => s.id);

    // Mark sessions as inactive
    await db.update(activeSessions)
      .set({ isActive: false })
      .where(sql`${activeSessions.id} IN ${sessionIds}`);

    logger.warn({
      count: staleSessions.length,
      userIds,
      threshold: STALE_SESSION_THRESHOLD_MS / 1000 + 's',
    }, 'Invalidated stale sessions (client unresponsive)');

    // Notify via WebSocket to force logout if client recovers
    try {
      const { getWsInstance } = await import('./ws-server');
      const ws = getWsInstance();
      if (ws) {
        for (const session of staleSessions) {
          ws.sendToUser(session.userId, {
            type: 'SESSION_INVALID',
            payload: {
              reason: 'client_unresponsive',
              message: 'Session invalidée pour inactivité prolongée. Veuillez vous reconnecter.',
              sessionId: session.sessionId,
            }
          });
        }
      }
    } catch (wsError) {
      // WebSocket notification is best-effort
      logger.debug({ err: wsError }, 'Could not send stale session notification via WebSocket');
    }

    return { count: staleSessions.length, userIds };
  } catch (error) {
    logger.error({ err: error }, 'Error invalidating stale sessions');
    return { count: 0, userIds: [] };
  }
}
