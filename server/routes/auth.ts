import type { Express } from "express";
import { insertUserSchema, users, userPermissions, modules, permissions, userAgences, agences, userRoles, employes, activeSessions } from "@shared/schema";
import { SystemRole, isAdminRole, normalizeRole } from "@shared/types/roles";
import { storage } from "../storage";
import { loginUser, registerUser, requireAuth, hashPassword, comparePasswords, SESSION_CONFIG } from "../auth";
import { attachAbility, requireAbility, requireResetPassword } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit, logLoginAttempt, getLoginLockoutInfo, validatePassword, getPasswordRequirements, getAuditLogs, clearLoginAttemptsOnSuccess, purgeOldAuditLogs, getAuditLogStats } from "../audit";
import { createSessionRecord, deleteSessionRecord, deleteUserSessions, getActiveSessions, isSessionValid, markSessionInactive, markUserSessionsInactive, sessionGuard, enforceSessionLimit, countUserSessions, getUserSessions, getMaxSessionsPerUser } from "../session-tracker";
import { getPermissionsForUser } from "../services/permissions-service";
import refreshTokenService, { REFRESH_TOKEN_COOKIE_NAME } from "../services/refresh-token-service";
import { requestOtp, verifyOtp, OtpRateLimitError } from "../services/notifications/otp/otp-service";
import { z } from "zod";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { db, withTimeout } from "../db";
import { StatutUser } from "@shared/enum/status-constants";

// Timeouts pour les opérations critiques (en ms)
const LOGIN_TIMEOUT_MS = 15000;      // 15 secondes max pour tout le processus de login
const DB_OPERATION_TIMEOUT_MS = 5000; // 5 secondes max par opération DB
import { dispatchDomainEvent } from "../services/notifications/domain-events/event-registry";
import { StorageService } from "../services/storage-service";
import { createLogger } from "../lib/logger";

const logger = createLogger('Auth');

/**
 * Récupérer le caissePin d'un utilisateur depuis la table employes.
 * Architecture V3: caissePin est stocké dans employes, pas users.
 */
async function getUserCaissePin(userId: string): Promise<string | null> {
  const [employe] = await db.select({ caissePin: employes.caissePin })
    .from(employes)
    .where(eq(employes.userId, userId));
  return employe?.caissePin || null;
}

/**
 * Mettre à jour le caissePin d'un utilisateur dans la table employes.
 */
async function setUserCaissePin(userId: string, hashedPin: string): Promise<void> {
  await db.update(employes)
    .set({ caissePin: hashedPin, updatedAt: new Date() })
    .where(eq(employes.userId, userId));
}

/**
 * Récupère le rôle effectif d'un utilisateur.
 *
 * Architecture V3 - Source unique: userRoles
 * 1. Rôle principal (isPrimary = true)
 * 2. Premier rôle disponible (par date de création)
 * 3. CLIENT (fallback par défaut)
 *
 * @param userId - ID de l'utilisateur
 * @param agenceId - (optionnel) Si fourni, cherche un rôle scopé à cette agence
 * @returns Le rôle effectif de l'utilisateur
 */
async function getEffectiveRole(userId: string, agenceId?: string): Promise<SystemRole> {
  // 1. Chercher le rôle principal
  const [primaryRole] = await db.select({ role: userRoles.role })
    .from(userRoles)
    .where(
      agenceId
        ? and(eq(userRoles.userId, userId), eq(userRoles.isPrimary, true), eq(userRoles.agenceId, agenceId))
        : and(eq(userRoles.userId, userId), eq(userRoles.isPrimary, true))
    )
    .limit(1);

  if (primaryRole?.role) {
    return primaryRole.role as SystemRole;
  }

  // 2. Si pas de rôle principal, prendre le premier rôle disponible
  const [anyRole] = await db.select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
    .orderBy(asc(userRoles.createdAt))
    .limit(1);

  if (anyRole?.role) {
    return anyRole.role as SystemRole;
  }

  // 3. Fallback: CLIENT
  return SystemRole.CLIENT;
}

/**
 * Récupère tous les rôles d'un utilisateur (pour l'architecture multi-rôles)
 * @param userId - ID de l'utilisateur
 * @returns Liste des rôles avec leur scope agence
 */
async function getUserRoles(userId: string): Promise<Array<{ role: SystemRole; agenceId: string | null; isPrimary: boolean }>> {
  const roles = await db.select({
    role: userRoles.role,
    agenceId: userRoles.agenceId,
    isPrimary: userRoles.isPrimary,
  })
  .from(userRoles)
  .where(eq(userRoles.userId, userId));

  return roles.map(r => ({
    role: r.role as SystemRole,
    agenceId: r.agenceId,
    isPrimary: r.isPrimary,
  }));
}

const normalizeUserPayload = (payload: any) => {
  if (!payload || typeof payload !== "object") return payload;
  const data: any = { ...payload };

  if (typeof data.name === "string" && data.name.trim()) {
    const parts = data.name.trim().split(/\s+/).filter(Boolean);
    if (!data.prenom && parts.length > 0) {
      data.prenom = parts[0];
    }
    if (!data.nom && parts.length > 1) {
      data.nom = parts.slice(1).join(" ");
    }
    if (!data.nom && parts.length === 1) {
      data.nom = parts[0];
    }
  }

  if (typeof data.phone === "string" && !data.telephone) {
    data.telephone = data.phone;
  }

  if (typeof data.photo_profile === "string" && !data.photoProfile) {
    data.photoProfile = data.photo_profile;
  }

  delete data.name;
  delete data.phone;
  delete data.photo_profile;

  return data;
};

async function resolvePrimaryAgence(userId: string): Promise<{ agenceId: string; agenceNom: string | null } | null> {
  const [primaryAgence] = await db
    .select({
      agenceId: userAgences.agenceId,
      agenceNom: agences.nom,
    })
    .from(userAgences)
    .leftJoin(agences, eq(userAgences.agenceId, agences.id))
    .where(and(
      eq(userAgences.userId, userId),
      eq(userAgences.isPrimary, true),
      eq(userAgences.actif, true)
    ))
    .limit(1);

  if (primaryAgence) {
    return primaryAgence;
  }

  const [anyAgence] = await db
    .select({
      agenceId: userAgences.agenceId,
      agenceNom: agences.nom,
    })
    .from(userAgences)
    .leftJoin(agences, eq(userAgences.agenceId, agences.id))
    .where(and(
      eq(userAgences.userId, userId),
      eq(userAgences.actif, true)
    ))
    .limit(1);

  return anyAgence || null;
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/login", async (req, res) => {
    const loginStartTime = Date.now();
    const { username } = req.body;

    logger.info({ username, step: 'start' }, '[Login] Request received');

    try {
      const { password, deviceFingerprint, deviceFingerprintPartial, rememberMe } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      // Step 1: Check lockout with timeout
      logger.debug({ username, step: 'lockout_check' }, '[Login] Checking lockout status');
      const lockoutInfo = await withTimeout(
        getLoginLockoutInfo(username),
        DB_OPERATION_TIMEOUT_MS,
        'getLoginLockoutInfo'
      );

      if (lockoutInfo.locked) {
        await logLoginAttempt(username, req, false, "account_locked");
        logger.warn({ username, step: 'locked' }, '[Login] Account locked');
        return res.status(403).json({
          message: "Compte verrouillé suite à trop de tentatives échouées.",
          locked: true,
          retryAfterSeconds: lockoutInfo.retryAfterSeconds,
          lockedUntil: lockoutInfo.lockedUntil,
        });
      }

      // Step 2: Authenticate user with timeout
      logger.debug({ username, step: 'authenticate' }, '[Login] Authenticating user');
      const user = await withTimeout(
        loginUser(username, password),
        DB_OPERATION_TIMEOUT_MS,
        'loginUser'
      );

      if (!user) {
        await logLoginAttempt(username, req, false, "invalid_credentials");
        const updatedInfo = await getLoginLockoutInfo(username);
        logger.info({ username, step: 'invalid_credentials' }, '[Login] Invalid credentials');
        return res.status(401).json({
          message: "Identifiant ou mot de passe incorrect",
          remainingAttempts: updatedInfo.remainingAttempts,
          ...(updatedInfo.locked ? {
            locked: true,
            retryAfterSeconds: updatedInfo.retryAfterSeconds,
            lockedUntil: updatedInfo.lockedUntil,
          } : {}),
        });
      }

      if (user.statut !== StatutUser.ACTIVE) {
        await logLoginAttempt(username, req, false, "account_disabled");
        logger.warn({ username, step: 'account_disabled' }, '[Login] Account disabled');
        return res.status(403).json({ message: "Compte désactivé. Contactez un administrateur." });
      }

      // Step 3: User authenticated successfully
      logger.debug({ username, userId: user.id, step: 'authenticated' }, '[Login] User authenticated');
      await clearLoginAttemptsOnSuccess(username);
      await logLoginAttempt(username, req, true);

      // Step 4: Resolve primary agence with timeout
      logger.debug({ username, step: 'resolve_agence' }, '[Login] Resolving primary agence');
      const primaryAgence = await withTimeout(
        resolvePrimaryAgence(user.id),
        DB_OPERATION_TIMEOUT_MS,
        'resolvePrimaryAgence'
      );

      // Notify Admins
      // Notify Admins
      try {
        const { getWsInstance } = await import("../ws-server");
        const wsInstance = getWsInstance();
        if (wsInstance) {
           wsInstance.broadcast({
              type: "NOTIFICATION",
              payload: {
                 message: `Connexion: ${username}`,
                 targetRole: SystemRole.ADMIN
              }
           });
           wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
           
           // Activité en temps réel
           wsInstance.broadcast({
             type: "LIVE_ACTIVITY",
             payload: {
               action: `Connexion: ${user.prenom || ''} ${user.nom}`.trim(),
               user: primaryAgence?.agenceNom || 'Siège',
               type: 'login',
               timestamp: new Date().toISOString()
             }
           });
        }
      } catch (e) {
        logger.error({ err: e }, 'Failed to send WS notification');
      }
      
      // Step 5: Get effective role with timeout
      logger.debug({ username, step: 'get_role' }, '[Login] Getting effective role');
      const effectiveRole = await withTimeout(
        getEffectiveRole(user.id, primaryAgence?.agenceId),
        DB_OPERATION_TIMEOUT_MS,
        'getEffectiveRole'
      );

      // Step 6: Regenerate session to prevent session fixation attacks
      logger.debug({ username, step: 'regenerate_session' }, '[Login] Regenerating session');
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) {
            logger.error({ err }, 'Session regeneration failed during login');
            reject(err);
          } else {
            resolve();
          }
        });
      });

      req.session.userId = user.id;
      req.session.user = {
          id: user.id,
          username: user.username || user.nom,
          nom: user.nom,
          prenom: user.prenom,
          role: effectiveRole,
          agence: primaryAgence?.agenceNom || null,
          agenceId: primaryAgence?.agenceId,
          email: user.email || undefined,
          telephone: user.telephone || undefined,
          mustChangePassword: user.mustChangePassword || false
      };

      // Save session with timeout
      logger.debug({ username, step: 'save_session' }, '[Login] Saving session');
      try {
        await withTimeout(
          new Promise<void>((resolve, reject) => {
            req.session.save((err) => {
              if (err) {
                logger.error({ err }, 'Session save error');
                reject(err);
              } else {
                resolve();
              }
            });
          }),
          DB_OPERATION_TIMEOUT_MS,
          'sessionSave'
        );
      } catch (sessionErr) {
        logger.warn({ err: sessionErr }, '[Login] Session save failed, but continuing login');
      }

      // Enforce session limit (max 3 sessions per user)
      // If limit reached, oldest session(s) will be terminated
      const limitResult = await enforceSessionLimit(user.id);
      if (limitResult.sessionsTerminated > 0) {
        logger.info({
          userId: user.id,
          terminated: limitResult.sessionsTerminated,
          devices: limitResult.terminatedSessions.map(s => `${s.browser}/${s.deviceType}`).join(', '),
        }, 'Session limit enforced - old sessions terminated');
      }

      // Create session tracking record aligned with absolute session timeout (12h workday)
      // Include device fingerprint for stolen cookie detection
      const expiresAt = new Date(Date.now() + SESSION_CONFIG.ABSOLUTE_TIMEOUT_MS);
      await createSessionRecord(
        req.sessionID,
        user.id,
        req,
        expiresAt,
        deviceFingerprint,
        deviceFingerprintPartial
      );

      // Log successful login in audit
      await logAudit(
        req,
        "LOGIN",
        "auth",
        user.id,
        { ip: req.ip, userAgent: req.headers['user-agent'] },
        "success",
        "low"
      );

      // Step 7: Load permissions with timeout (critical step that can block)
      logger.debug({ username, step: 'load_permissions' }, '[Login] Loading permissions');
      const permissionsData = await withTimeout(
        getPermissionsForUser(user.id, effectiveRole),
        DB_OPERATION_TIMEOUT_MS,
        'getPermissionsForUser'
      );

      // Handle "Remember Me" - create refresh token for persistent sessions
      let rememberMeInfo: { expiresAt: Date } | null = null;
      if (rememberMe) {
        const refreshTokenResult = await refreshTokenService.create(user.id, req);

        // Set refresh token as HTTP-only cookie
        res.cookie(
          REFRESH_TOKEN_COOKIE_NAME,
          refreshTokenResult.token,
          refreshTokenService.getCookieOptions(refreshTokenResult.expiresAt)
        );

        rememberMeInfo = { expiresAt: refreshTokenResult.expiresAt };
        logger.info({ userId: user.id }, 'Created remember-me refresh token');
      }

      // Step 8: Success - send response
      const totalDuration = Date.now() - loginStartTime;
      logger.info({
        username,
        userId: user.id,
        role: effectiveRole,
        agence: primaryAgence?.agenceNom,
        durationMs: totalDuration,
        step: 'complete'
      }, `[Login] Success in ${totalDuration}ms`);

      res.json({
        user: req.session.user,
        message: "Login successful",
        mustChangePassword: user.mustChangePassword || false,
        permissions: permissionsData,
        rememberMe: rememberMeInfo,
      });
    } catch (error) {
      const totalDuration = Date.now() - loginStartTime;
      const isTimeout = error instanceof Error && error.message.includes('Timeout');

      logger.error({
        username,
        durationMs: totalDuration,
        isTimeout,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      }, `[Login] Failed after ${totalDuration}ms`);

      if (isTimeout) {
        return res.status(504).json({
          message: "Le serveur met trop de temps à répondre. Veuillez réessayer.",
          error: "TIMEOUT"
        });
      }

      res.status(500).json({ message: "Erreur interne lors de la connexion" });
    }
  });

  // ============================================
  // SESSION INFO & EXTENSION
  // ============================================

  /**
   * GET /api/auth/session-info
   * Returns session expiration info for the client to display warnings
   */
  app.get("/api/auth/session-info", requireAuth, async (req, res) => {
    try {
      const sessionId = req.sessionID;
      const [session] = await db.select({
        expiresAt: activeSessions.expiresAt,
        lastActivity: activeSessions.lastActivity,
        loginAt: activeSessions.loginAt,
      })
      .from(activeSessions)
      .where(eq(activeSessions.sessionId, sessionId));

      if (!session) {
        return res.status(404).json({ error: "Session non trouvée" });
      }

      // Calculate time remaining (cookie-based, 2 hour rolling for microfinance)
      const cookieMaxAge = SESSION_CONFIG.INACTIVITY_TIMEOUT_MS;
      const lastActivity = new Date(session.lastActivity).getTime();
      const expiresAt = lastActivity + cookieMaxAge;
      const now = Date.now();
      const remainingMs = Math.max(0, expiresAt - now);

      res.json({
        expiresAt: new Date(expiresAt).toISOString(),
        remainingMs,
        remainingMinutes: Math.floor(remainingMs / 60000),
        lastActivity: session.lastActivity,
        loginAt: session.loginAt,
        warningThresholdMs: SESSION_CONFIG.WARNING_BEFORE_EXPIRY_MS,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error getting session info');
      res.status(500).json({ error: "Erreur lors de la récupération des infos de session" });
    }
  });

  /**
   * POST /api/auth/extend-session
   * Extends the session by touching it (updates lastActivity)
   */
  app.post("/api/auth/extend-session", requireAuth, async (req, res) => {
    try {
      const sessionId = req.sessionID;
      const userId = req.session.user!.id;

      // Update session activity (this extends the rolling session)
      await db.update(activeSessions)
        .set({ lastActivity: new Date() })
        .where(eq(activeSessions.sessionId, sessionId));

      // Touch the express session to refresh the cookie
      req.session.touch();

      const cookieMaxAge = SESSION_CONFIG.INACTIVITY_TIMEOUT_MS;
      const newExpiresAt = Date.now() + cookieMaxAge;
      const remainingMinutes = Math.floor(cookieMaxAge / 60000);

      logger.info({ userId, sessionId: sessionId.slice(0, 8) }, 'Session extended by user');

      res.json({
        success: true,
        message: `Session prolongée de ${remainingMinutes} minutes`,
        expiresAt: new Date(newExpiresAt).toISOString(),
        remainingMs: cookieMaxAge,
        remainingMinutes,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error extending session');
      res.status(500).json({ error: "Erreur lors de la prolongation de la session" });
    }
  });

  // ============================================
  // REFRESH TOKEN (Remember Me)
  // ============================================

  /**
   * POST /api/auth/refresh
   * Uses a refresh token to create a new session (for "Remember Me" functionality)
   * The refresh token is sent as an HTTP-only cookie
   */
  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

      if (!refreshToken) {
        return res.status(401).json({
          error: "no_refresh_token",
          message: "Aucun token de rafraîchissement trouvé",
        });
      }

      // Use the refresh token (this rotates it)
      const result = await refreshTokenService.use(refreshToken);

      if (!result.success) {
        // Clear the invalid cookie
        res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/api/auth' });

        return res.status(401).json({
          error: result.error,
          message: result.error === 'token_expired'
            ? "Token expiré - veuillez vous reconnecter"
            : result.error === 'token_revoked'
            ? "Session révoquée pour raison de sécurité"
            : "Token invalide",
        });
      }

      // Get user data to create a new session
      const [user] = await db.select()
        .from(users)
        .where(eq(users.id, result.userId!));

      if (!user) {
        res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/api/auth' });
        return res.status(401).json({ error: "user_not_found" });
      }

      // Get user's effective role
      const [primaryRole] = await db.select({ role: userRoles.role })
        .from(userRoles)
        .where(and(
          eq(userRoles.userId, user.id),
          eq(userRoles.isPrimary, true)
        ));

      const effectiveRole = normalizeRole(primaryRole?.role) || SystemRole.CLIENT;

      // Get user's primary agence
      const primaryAgence = await resolvePrimaryAgence(user.id);

      // Create a new express session
      req.session.regenerate(async (err) => {
        if (err) {
          logger.error({ err }, 'Session regeneration failed during refresh');
          res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/api/auth' });
          return res.status(500).json({ error: "session_error" });
        }

        // Set session data
        req.session.userId = user.id;
        req.session.user = {
          id: user.id,
          username: user.username || '',
          email: user.email || '',
          nom: user.nom,
          prenom: user.prenom,
          role: effectiveRole,
          statut: user.statut,
          agence: primaryAgence?.agenceNom || null,
          agenceId: primaryAgence?.agenceId,
          photoProfile: user.photoProfile,
          mustChangePassword: user.mustChangePassword || false,
        };

        // Create session tracking record aligned with absolute session timeout
        const expiresAt = new Date(Date.now() + SESSION_CONFIG.ABSOLUTE_TIMEOUT_MS);
        const { deviceFingerprint, deviceFingerprintPartial } = req.body || {};
        await createSessionRecord(
          req.sessionID,
          user.id,
          req,
          expiresAt,
          deviceFingerprint,
          deviceFingerprintPartial
        );

        // Set new refresh token cookie
        res.cookie(
          REFRESH_TOKEN_COOKIE_NAME,
          result.newToken!,
          refreshTokenService.getCookieOptions(result.newExpiresAt!)
        );

        // Load permissions
        const permissionsData = await getPermissionsForUser(user.id, effectiveRole);

        logger.info({ userId: user.id }, 'Session refreshed via remember-me token');

        res.json({
          user: req.session.user,
          message: "Session restaurée",
          permissions: permissionsData,
          rememberMe: { expiresAt: result.newExpiresAt },
        });
      });
    } catch (error) {
      logger.error({ err: error }, 'Error refreshing session');
      res.status(500).json({ error: "Erreur lors du rafraîchissement de la session" });
    }
  });

  /**
   * POST /api/auth/revoke-remember-me
   * Revokes the current remember-me token (logout from persistent session)
   */
  app.post("/api/auth/revoke-remember-me", async (req, res) => {
    try {
      const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

      if (refreshToken) {
        await refreshTokenService.revoke(refreshToken, 'user_logout');
      }

      res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/api/auth' });

      res.json({ success: true, message: "Remember-me révoqué" });
    } catch (error) {
      logger.error({ err: error }, 'Error revoking remember-me');
      res.status(500).json({ error: "Erreur lors de la révocation" });
    }
  });

  // ============================================
  // FORGOT PASSWORD (Self-service password reset)
  // ============================================

  /**
   * POST /api/auth/forgot-password
   * Requests a password reset OTP to be sent via SMS or email
   * Public endpoint (no auth required)
   */
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { identifier } = req.body;

      if (!identifier) {
        return res.status(400).json({
          error: "identifier_required",
          message: "Veuillez fournir votre email ou numéro de téléphone",
        });
      }

      // Find user by email or phone
      const [user] = await db.select({
        id: users.id,
        email: users.email,
        telephone: users.telephone,
        nom: users.nom,
        prenom: users.prenom,
        statut: users.statut,
        canLogin: users.canLogin,
      })
      .from(users)
      .where(
        identifier.includes('@')
          ? eq(users.email, identifier)
          : eq(users.telephone, identifier)
      );

      // Always return success to prevent user enumeration
      // But only send OTP if user exists and is active
      if (!user || user.statut !== StatutUser.ACTIVE || !user.canLogin) {
        logger.info({ identifier: identifier.slice(0, 5) + '***' }, 'Password reset requested for non-existent/inactive user');
        // Delay response to prevent timing attacks
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
        return res.json({
          success: true,
          message: "Si un compte existe avec ces informations, un code de vérification sera envoyé.",
        });
      }

      // Determine destination (prefer email, fallback to phone)
      const destination = user.email || user.telephone;
      if (!destination) {
        logger.warn({ userId: user.id }, 'User has no email or phone for password reset');
        return res.json({
          success: true,
          message: "Si un compte existe avec ces informations, un code de vérification sera envoyé.",
        });
      }

      const channel = user.email ? 'EMAIL' : 'SMS';

      // Request OTP
      const otpResult = await requestOtp({
        userId: user.id,
        destination,
        channel,
        purpose: 'PASSWORD_RESET',
        templatePayload: {
          userName: `${user.prenom || ''} ${user.nom}`.trim(),
        },
        ipAddress: req.ip,
      });

      logger.info({
        userId: user.id,
        channel,
        destinationMasked: destination.slice(0, 3) + '***',
      }, 'Password reset OTP sent');

      res.json({
        success: true,
        message: "Si un compte existe avec ces informations, un code de vérification sera envoyé.",
        // Only expose these in development
        ...(process.env.NODE_ENV !== 'production' ? {
          debug: {
            otpId: otpResult.otpId,
            code: otpResult.debugCode,
            expiresAt: otpResult.expiresAt,
          }
        } : {}),
      });
    } catch (error) {
      if (error instanceof OtpRateLimitError) {
        return res.status(429).json({
          error: "rate_limited",
          message: error.message,
        });
      }
      logger.error({ err: error }, 'Forgot password error');
      res.status(500).json({
        error: "server_error",
        message: "Une erreur est survenue. Veuillez réessayer plus tard.",
      });
    }
  });

  /**
   * POST /api/auth/reset-password
   * Resets password using OTP verification
   * Public endpoint (no auth required)
   */
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { identifier, code, newPassword } = req.body;

      if (!identifier || !code || !newPassword) {
        return res.status(400).json({
          error: "missing_fields",
          message: "Tous les champs sont requis (identifiant, code, nouveau mot de passe)",
        });
      }

      // Validate password complexity
      const requirements = await getPasswordRequirements();
      const validation = validatePassword(newPassword, requirements);
      if (!validation.valid) {
        return res.status(400).json({
          error: "password_weak",
          message: "Le mot de passe ne respecte pas les exigences de sécurité",
          details: validation.errors,
        });
      }

      // Find user
      const [user] = await db.select({
        id: users.id,
        email: users.email,
        telephone: users.telephone,
        nom: users.nom,
        prenom: users.prenom,
        username: users.username,
        statut: users.statut,
      })
      .from(users)
      .where(
        identifier.includes('@')
          ? eq(users.email, identifier)
          : eq(users.telephone, identifier)
      );

      if (!user) {
        return res.status(400).json({
          error: "invalid_code",
          message: "Code invalide ou expiré",
        });
      }

      // Determine destination for OTP verification
      const destination = user.email || user.telephone;
      if (!destination) {
        return res.status(400).json({
          error: "invalid_code",
          message: "Code invalide ou expiré",
        });
      }

      // Verify OTP
      const otpResult = await verifyOtp({
        destination,
        purpose: 'PASSWORD_RESET',
        code,
      });

      if (!otpResult.valid) {
        return res.status(400).json({
          error: "invalid_code",
          message: otpResult.error || "Code invalide ou expiré",
          attemptsRemaining: otpResult.attemptsRemaining,
        });
      }

      // OTP verified - update password
      const hashedPassword = await hashPassword(newPassword);
      await db.update(users)
        .set({
          password: hashedPassword,
          mustChangePassword: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // SECURITY: Invalidate ALL sessions for this user
      await markUserSessionsInactive(user.id);

      // Revoke ALL refresh tokens
      await refreshTokenService.revokeUser(user.id, 'password_reset');

      // Audit log
      await logAudit(
        req,
        "PASSWORD_RESET_SELF",
        "auth",
        user.id,
        { method: 'otp', ip: req.ip },
        "success",
        "critical"
      );

      // Domain event for notification
      dispatchDomainEvent({
        type: "USER_PASSWORD_CHANGED",
        data: {
          userId: user.id,
          userName: [user.nom, user.prenom].filter(Boolean).join(" ") || user.username || "",
          email: user.email || undefined,
          resetMethod: 'self_service',
        },
        timestamp: new Date(),
      });

      logger.info({ userId: user.id }, 'Password reset completed via self-service');

      res.json({
        success: true,
        message: "Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.",
      });
    } catch (error) {
      logger.error({ err: error }, 'Reset password error');
      res.status(500).json({
        error: "server_error",
        message: "Une erreur est survenue. Veuillez réessayer plus tard.",
      });
    }
  });

  /**
   * GET /api/auth/my-sessions
   * Returns all active sessions for the current user
   */
  app.get("/api/auth/my-sessions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user!.id;
      const currentSessionId = req.sessionID;

      const sessions = await db.select({
        id: activeSessions.id,
        sessionId: activeSessions.sessionId,
        deviceType: activeSessions.deviceType,
        browser: activeSessions.browser,
        os: activeSessions.os,
        ipAddress: activeSessions.ipAddress,
        location: activeSessions.location,
        loginAt: activeSessions.loginAt,
        lastActivity: activeSessions.lastActivity,
        isActive: activeSessions.isActive,
      })
      .from(activeSessions)
      .where(and(
        eq(activeSessions.userId, userId),
        eq(activeSessions.isActive, true)
      ))
      .orderBy(desc(activeSessions.lastActivity));

      // Mark which session is the current one
      const sessionsWithCurrent = sessions.map(s => ({
        ...s,
        isCurrent: s.sessionId === currentSessionId,
        // Mask session ID for security (show only first 8 chars)
        sessionIdMasked: s.sessionId.slice(0, 8) + '...',
      }));

      res.json({
        sessions: sessionsWithCurrent,
        count: sessions.length,
        maxAllowed: getMaxSessionsPerUser(),
      });
    } catch (error) {
      logger.error({ err: error }, 'Error getting user sessions');
      res.status(500).json({ error: "Erreur lors de la récupération des sessions" });
    }
  });

  /**
   * DELETE /api/auth/sessions/:sessionId
   * Revoke a specific session (user can only revoke their own sessions)
   */
  app.delete("/api/auth/sessions/:sessionId", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user!.id;
      const { sessionId } = req.params;
      const currentSessionId = req.sessionID;

      // Cannot revoke current session (use logout instead)
      if (sessionId === currentSessionId) {
        return res.status(400).json({
          error: "Impossible de révoquer la session actuelle. Utilisez la déconnexion.",
        });
      }

      // Verify the session belongs to the current user
      const [session] = await db.select({
        id: activeSessions.id,
        userId: activeSessions.userId,
      })
      .from(activeSessions)
      .where(eq(activeSessions.sessionId, sessionId));

      if (!session) {
        return res.status(404).json({ error: "Session non trouvée" });
      }

      if (session.userId !== userId) {
        return res.status(403).json({ error: "Vous ne pouvez pas révoquer cette session" });
      }

      // Mark session as inactive
      await db.update(activeSessions)
        .set({ isActive: false })
        .where(eq(activeSessions.sessionId, sessionId));

      // Notify via WebSocket
      try {
        const { getWsInstance } = await import('../ws-server');
        const ws = getWsInstance();
        if (ws) {
          ws.sendToUser(userId, {
            type: 'SESSION_INVALID',
            payload: {
              reason: 'session_revoked',
              message: 'Cette session a été révoquée depuis un autre appareil.',
              sessionId,
            }
          });
        }
      } catch {
        // WebSocket notification is best-effort
      }

      logger.info({ userId, revokedSessionId: sessionId.slice(0, 8) }, 'Session revoked by user');

      res.json({ success: true, message: "Session révoquée avec succès" });
    } catch (error) {
      logger.error({ err: error }, 'Error revoking session');
      res.status(500).json({ error: "Erreur lors de la révocation de la session" });
    }
  });

  /**
   * DELETE /api/auth/sessions
   * Revoke all sessions except the current one (logout everywhere else)
   */
  app.delete("/api/auth/sessions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user!.id;
      const currentSessionId = req.sessionID;

      // Get all other sessions
      const otherSessions = await db.select({ sessionId: activeSessions.sessionId })
        .from(activeSessions)
        .where(and(
          eq(activeSessions.userId, userId),
          eq(activeSessions.isActive, true),
          sql`${activeSessions.sessionId} != ${currentSessionId}`
        ));

      if (otherSessions.length === 0) {
        return res.json({
          success: true,
          message: "Aucune autre session à révoquer",
          count: 0,
        });
      }

      // Mark all other sessions as inactive
      await db.update(activeSessions)
        .set({ isActive: false })
        .where(and(
          eq(activeSessions.userId, userId),
          sql`${activeSessions.sessionId} != ${currentSessionId}`
        ));

      // Notify via WebSocket
      try {
        const { getWsInstance } = await import('../ws-server');
        const ws = getWsInstance();
        if (ws) {
          for (const session of otherSessions) {
            ws.sendToUser(userId, {
              type: 'SESSION_INVALID',
              payload: {
                reason: 'logout_everywhere',
                message: 'Vous avez été déconnecté de tous les autres appareils.',
                sessionId: session.sessionId,
              }
            });
          }
        }
      } catch {
        // WebSocket notification is best-effort
      }

      logger.info({ userId, count: otherSessions.length }, 'All other sessions revoked by user');

      res.json({
        success: true,
        message: `${otherSessions.length} session(s) révoquée(s)`,
        count: otherSessions.length,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error revoking all sessions');
      res.status(500).json({ error: "Erreur lors de la révocation des sessions" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    const sessionId = req.sessionID;
    const userId = req.session.user?.id;

    if (req.session.user) {
      await logAudit(
        req,
        "LOGOUT",
        "auth",
        req.session.user.id,
        undefined,
        "success",
        "low"
      );
    }

    // Delete from active_sessions table
    if (sessionId) {
      await deleteSessionRecord(sessionId);
    }

    // Revoke any refresh token (remember-me)
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
    if (refreshToken) {
      await refreshTokenService.revoke(refreshToken, 'user_logout');
    }
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/api/auth' });

    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ message: "Logout successful" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.user) return res.sendStatus(401);

    // Validate session is still active in database
    const validity = await isSessionValid(req.sessionID);
    if (!validity.valid) {
      logger.warn({ sessionId: req.sessionID, reason: validity.reason }, 'Session invalid');

      // Destroy the session
      req.session.destroy((err) => {
        if (err) logger.error({ err }, 'Error destroying invalid session');
      });

      return res.status(401).json({
        message: 'Session expired or invalidated',
        code: 'SESSION_INVALID',
        reason: validity.reason
      });
    }

    // Auto-repair session if agenceId is missing
    if (!req.session.user.agenceId) {
       try {
          const primaryAgence = await resolvePrimaryAgence(req.session.user.id);
          if (primaryAgence) {
            req.session.user.agenceId = primaryAgence.agenceId;
            req.session.user.agence = primaryAgence.agenceNom;
            await new Promise<void>((resolve) => req.session.save(() => resolve()));
          }
       } catch (e) {
         logger.error({ err: e }, 'Session repair failed');
       }
    }

    // Récupérer les données utilisateur pour les champs non présents en session
    let userData: { photoProfile?: string | null; telephone?: string | null; adresse?: string | null } = {};
    try {
      const user = await storage.getUser(req.session.user.id);
      if (user) {
        userData = {
          photoProfile: user.photoProfile,
          telephone: user.telephone,
          adresse: user.adresse,
        };
      }
    } catch {
      // Erreur lors de la récupération, on continue sans
    }

    // Enrichir avec les données employé si disponibles (incluant poste et département)
    let employeData: Record<string, any> | null = null;
    try {
      const employeBase = await storage.getEmployeByUserId(req.session.user.id);
      if (employeBase) {
        // Récupérer les données complètes avec poste et département
        const employeWithDetails = await storage.getEmployeWithUser(employeBase.id);
        if (employeWithDetails) {
          employeData = {
            employeId: employeBase.id,
            matricule: employeWithDetails.matricule,
            jobPositionId: employeWithDetails.jobPositionId,
            dateEmbauche: employeWithDetails.dateEmbauche,
            typeContrat: employeWithDetails.typeContrat,
            salaireBase: employeWithDetails.salaireBase,
            hasCaissePin: !!employeWithDetails.caissePin,
            agenceId: employeWithDetails.agenceId,
            // Données enrichies depuis les jointures
            jobPosition: employeWithDetails.jobPosition ? {
              id: employeWithDetails.jobPosition.id,
              code: employeWithDetails.jobPosition.code,
              name: employeWithDetails.jobPosition.name,
            } : null,
            department: employeWithDetails.department ? {
              id: employeWithDetails.department.id,
              code: employeWithDetails.department.code,
              name: employeWithDetails.department.name,
            } : null,
          };
        }
      }
    } catch {
      // Pas de données employé, c'est OK
    }

    res.json({
      ...req.session.user,
      ...userData,
      ...employeData,
      sessionValid: true // Explicit session validity indicator
    });
  });

  app.post("/api/auth/verify-pin", requireAuth, async (req, res) => {
    try {
      const { pin } = req.body;
      if (!pin) return res.status(400).json({ error: "PIN requis" });

      const userId = req.session.user!.id;
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ error: "Session invalide. Veuillez vous reconnecter." });

      // Architecture V3: caissePin est dans employes, pas users
      const caissePin = await getUserCaissePin(userId);

      if (!caissePin) {
         return res.status(400).json({ error: "Aucun PIN configuré", requirePinSetup: true });
      }

      const isValid = await comparePasswords(pin, caissePin);

      if (!isValid) {
          return res.status(401).json({ error: "PIN incorrect" });
      }

      // Architecture V3: Rôle via getEffectiveRole
      const effectiveRole = await getEffectiveRole(userId);

      return res.json({
          id: user.id,
          username: user.username,
          name: `${user.prenom || ''} ${user.nom}`.trim(),
          role: effectiveRole,
          hasPinConfigured: true
      });

    } catch (e) {
      logger.error({ err: e }, 'Error verifying PIN');
      res.status(500).json({ error: "Erreur de vérification" });
    }
  });

  // Check if current user has a PIN configured (no PIN required)
  app.get("/api/auth/pin-status", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user!.id;
      const caissePin = await getUserCaissePin(userId);

      return res.json({
        hasPinConfigured: !!caissePin
      });
    } catch (e) {
      logger.error({ err: e }, 'Error checking PIN status');
      res.status(500).json({ error: "Erreur de vérification" });
    }
  });

  app.get("/api/user", requireAuth, async (req, res) => {
    if (!req.session.user) return res.sendStatus(401);
    const user = await storage.getUser(req.session.user.id);
    res.json(user);
  });

  app.put("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.user!.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const normalizedBody = normalizeUserPayload(req.body);
      const { nom, prenom, email, telephone, username, photoProfile, dateNaissance, adresse, ville } = normalizedBody;
      
      // If username is being changed, check for duplicates
      if (username && username !== user.username) {
        const existingUser = await storage.getUserByUsername(username);
        if (existingUser && existingUser.id !== user.id) {
          return res.status(400).json({ message: "Username already taken" });
        }
      }

      const updateData: any = {
        nom: nom || user.nom,
        prenom: prenom || user.prenom,
        email: email || user.email,
        telephone: telephone || user.telephone
      };

      // Add username if provided and changed
      if (username && username !== user.username) {
        updateData.username = username;
      }

      if (photoProfile !== undefined) {
        updateData.photoProfile = photoProfile;
      }

      // Nouveaux champs: dateNaissance, adresse, ville
      if (dateNaissance !== undefined) {
        updateData.dateNaissance = dateNaissance;
      }
      if (adresse !== undefined) {
        updateData.adresse = adresse;
      }
      if (ville !== undefined) {
        updateData.ville = ville;
      }
      
      const [updated] = await db.update(users)
        .set(updateData)
        .where(eq(users.id, user.id))
        .returning();

      // Update session
      if (updated && req.session.user) {
          req.session.user.nom = updated.nom;
          req.session.user.prenom = updated.prenom;
          req.session.user.email = updated.email || undefined;
          req.session.user.telephone = updated.telephone || undefined;
          if (updated.username) {
            req.session.user.username = updated.username;
          }
          await new Promise<void>((resolve) => req.session.save(() => resolve()));
      }

      // Log if username was changed
      if (username && username !== user.username) {
        await logAudit(
          req,
          "UPDATE_USERNAME",
          "user",
          user.id,
          { oldUsername: user.username, newUsername: username },
          "success",
          "high"
        );
      }

      res.json(updated);
    } catch (error) {
       res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = await storage.getUser(req.session.user!.id);

    if (!user || !user.password || !(await comparePasswords(currentPassword, user.password))) {
      return res.status(400).json({ message: "Invalid current password" });
    }

    // Validate new password complexity
    const requirements = await getPasswordRequirements();
    const validation = validatePassword(newPassword, requirements);
    if (!validation.valid) {
        return res.status(400).json({ message: "Password does not meet requirements", details: validation.errors });
    }

    const hashedPassword = await hashPassword(newPassword);
    await db.update(users)
      .set({ 
        password: hashedPassword,
        mustChangePassword: false // Reset flag after password change
      })
      .where(eq(users.id, user.id));

    // Update session to reflect password change completion
    if (req.session.user) {
      req.session.user.mustChangePassword = false;
      await new Promise<void>((resolve) => req.session.save(() => resolve()));
    }

    await logAudit(
        req,
        "CHANGE_PASSWORD",
        "auth",
        user.id,
        undefined,
        "success",
        "high"
    );

    // Domain event: password changed (security confirmation)
    dispatchDomainEvent({
      type: "USER_PASSWORD_CHANGED",
      data: {
        userId: user.id,
        userName: [user.nom, user.prenom].filter(Boolean).join(" ") || user.username || "",
        email: user.email || undefined,
      },
      timestamp: new Date(),
    });

    res.json({ message: "Password updated successfully" });
  });

  app.post("/api/auth/register", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.USER), async (req, res) => {
    // Capture tempEntityId before schema parsing (insertUserSchema strips unknown fields)
    const tempEntityId = req.body?.tempEntityId || req.body?.temp_entity_id;

    try {
      const normalizedBody = normalizeUserPayload(req.body);

      // Validate complexity first
      if (normalizedBody.password) {
          const requirements = await getPasswordRequirements();
          const validation = validatePassword(normalizedBody.password, requirements);
          if (!validation.valid) return res.status(400).json(validation);
      }

      const parsed = insertUserSchema.safeParse(normalizedBody);
      if (!parsed.success) {
        return res.status(400).json(parsed.error);
      }

      if (!parsed.data.username) {
        return res.status(400).json({ message: "Username is required" });
      }

      const existingUser = await storage.getUserByUsername(parsed.data.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await registerUser(parsed.data as any);

      // Relocate files from temp UUID to real user ID
      if (tempEntityId && tempEntityId !== user.id) {
        try {
          const keyMapping = await StorageService.relocateEntityFiles('user', tempEntityId, user.id);

          if (keyMapping.size > 0 && user.photoProfile && keyMapping.has(user.photoProfile)) {
            await db.update(users)
              .set({ photoProfile: keyMapping.get(user.photoProfile)! })
              .where(eq(users.id, user.id));
          }

          await StorageService.deleteEntityFiles('user', tempEntityId);
        } catch (relocateError) {
          logger.error({ err: relocateError, userId: user.id }, 'File relocation failed for user');
        }
      }

      // Architecture V3: Le rôle sera attribué via userRoles, pas dans user
      await logAudit(
        req,
        "CREATE_USER",
        "user",
        user.id,
        { username: user.username },
        "success",
        "medium"
      );

      // Domain event: user registered (welcome email)
      dispatchDomainEvent({
        type: "USER_REGISTERED",
        data: {
          userId: user.id,
          username: user.username || "",
          nom: user.nom || "",
          prenom: user.prenom || undefined,
          email: user.email || undefined,
        },
        timestamp: new Date(),
      });

      res.status(201).json(user);
    } catch (error) {
      // Cleanup temp files if creation failed
      if (tempEntityId) {
        StorageService.deleteEntityFiles('user', tempEntityId)
          .catch(err => logger.error({ err }, 'Cleanup temp files failed'));
      }
      logger.error({ err: error }, 'Register error');
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // User Management - REMOVED DUPLICATE (see consolidated handler below)

  app.get("/api/users", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.USER), async (req, res) => {
    const allUsers = await storage.getAllUsers();

    // Architecture V3: Enrichir chaque utilisateur avec son rôle effectif depuis userRoles
    const usersWithRoles = await Promise.all(
      allUsers.map(async (user) => {
        const effectiveRole = await getEffectiveRole(user.id);
        return {
          ...user,
          role: effectiveRole
        };
      })
    );

    res.json(usersWithRoles);
  });

  app.get("/api/users/search", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.USER), async (req, res) => {
    const query = req.query.q as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    if (!query) {
      return res.json([]);
    }

    const results = await storage.searchUsers(query, limit);
    res.json(results);
  });

  app.get("/api/users/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.USER), async (req, res) => {
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Architecture V3: Enrichir avec le rôle effectif depuis userRoles
    const effectiveRole = await getEffectiveRole(user.id);
    res.json({
      ...user,
      role: effectiveRole
    });
  });

  app.patch("/api/users/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.USER), async (req, res) => {
    try {
      const userId = req.params.id;
      const updateData = normalizeUserPayload(req.body);

      // Extract role and password from payload - role is stored in userRoles, not users table
      const { role: newRole, password, ...userUpdateData } = updateData;

      // Hash password if provided
      if (password && typeof password === 'string' && password.trim()) {
        userUpdateData.password = await hashPassword(password.trim());
        logger.info({ userId }, 'User password updated via admin panel');
      }

      // Always update the updatedAt timestamp
      userUpdateData.updatedAt = new Date();

      // Update user data in users table (exclude role)
      const [updated] = await db.update(users).set(userUpdateData).where(eq(users.id, userId)).returning();

      // Handle role update in userRoles table
      if (newRole && updated) {
        // Check for existing primary role
        const [existingRole] = await db.select()
          .from(userRoles)
          .where(and(
            eq(userRoles.userId, userId),
            eq(userRoles.isPrimary, true)
          ));

        if (existingRole) {
          // Update existing primary role
          await db.update(userRoles)
            .set({ role: newRole, updatedAt: new Date() })
            .where(eq(userRoles.id, existingRole.id));
        } else {
          // Create new primary role
          await db.insert(userRoles).values({
            userId: userId,
            role: newRole,
            isPrimary: true,
          });
        }

        // Broadcast role change for real-time RBAC update
        const { getWsInstance } = await import("../ws-server");
        const wsInstance = getWsInstance();
        if (wsInstance) {
          wsInstance.broadcast({
            type: "RBAC_UPDATE",
            payload: {
              entity: 'user_role',
              userId,
              role: newRole
            }
          });
          logger.info({ userId, newRole }, 'RBAC: Broadcasted role change');
        }
      }

      if (updated) {
        await logAudit(
          req,
          "UPDATE_USER",
          "user",
          userId,
          updateData,
          "success",
          "medium"
        );

        // 🛡️ Kill Switch: Broadcast user status change for real-time logout
        if (userUpdateData.statut && userUpdateData.statut !== StatutUser.ACTIVE) {
          const { getWsInstance } = await import("../ws-server");
          const wsInstance = getWsInstance();
          if (wsInstance) {
            wsInstance.broadcast({
              type: "RBAC_UPDATE",
              payload: {
                entity: 'user_status',
                userId,
                status: userUpdateData.statut
              }
            });
            logger.warn({ userId, status: userUpdateData.statut }, 'SECURITY: Broadcasted user_status change');
          }
        }
      }

      // Return user with updated role
      const effectiveRole = await getEffectiveRole(userId);
      res.json({ ...updated, role: effectiveRole });
    } catch (e) {
      logger.error({ err: e }, 'Update user failed');
      res.status(500).json({ message: "Update failed" });
    }
  });

  app.delete("/api/users/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.USER), async (req, res) => {
    try {
      const userId = req.params.id;
      const userToDelete = await storage.getUser(userId);

      await db.update(users)
        .set({ deletedAt: new Date(), statut: StatutUser.INACTIVE })
        .where(eq(users.id, userId));

      // Architecture V3: Rôle via userRoles (pas dans userToDelete)
      const deletedUserRole = userToDelete ? await getEffectiveRole(userToDelete.id) : null;

      await logAudit(
        req,
        "DELETE_USER",
        "user",
        userId,
        userToDelete ? {
          deletedUser: {
            id: userToDelete.id,
            username: userToDelete.username,
            email: userToDelete.email,
            nom: userToDelete.nom,
            prenom: userToDelete.prenom,
            role: deletedUserRole
          }
        } : undefined,
        "success",
        "high"
      );

      // 🛡️ Kill Switch: Broadcast user deletion for immediate logout
      const { getWsInstance } = await import("../ws-server");
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "RBAC_UPDATE",
          payload: {
            entity: 'user_status',
            userId,
            status: StatutUser.INACTIVE
          }
        });
        logger.warn({ userId }, 'SECURITY: Broadcasted user deletion (INACTIVE)');
      }

      res.sendStatus(200);
    } catch (error) {
      logger.error({ err: error }, 'Error deleting user');
      res.status(500).json({ message: "Erreur lors de la suppression de l'utilisateur" });
    }
  });

  // Reset password for a user
  // CASL: Requires 'reset_password' permission on User
  app.post("/api/users/:id/reset-password", requireAuth, attachAbility, requireResetPassword(), async (req, res) => {
     const { password } = req.body;
     const passToUse = password || req.body.temporaryPassword;

     if (!passToUse) return res.status(400).json({message: "Password required"});

     const hashedPassword = await hashPassword(passToUse);
     await db.update(users).set({ password: hashedPassword }).where(eq(users.id, req.params.id));

     await logAudit(
        req,
        "RESET_PASSWORD",
        "user",
        req.params.id,
        undefined,
        "success",
        "high"
     );

     // Domain event: password reset
     dispatchDomainEvent({
       type: "USER_PASSWORD_RESET",
       data: {
         userId: req.params.id,
         resetByUserId: req.session.user?.id,
       },
       timestamp: new Date(),
     });

     res.json({ message: "Password reset" });
  });

  // Audit Logs
  app.get("/api/audit-logs", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.AUDIT_LOG), async (req, res) => {
    const { userId, action, resource, limit } = req.query;
    const logs = await getAuditLogs({
      userId: typeof userId === 'string' ? userId : undefined,
      action: typeof action === 'string' ? action : undefined,
      resource: typeof resource === 'string' ? resource : undefined,
      limit: typeof limit === 'string' ? parseInt(limit, 10) : undefined,
    });
    res.json(logs);
  });

  // Audit Logs Statistics
  app.get("/api/audit-logs/stats", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.AUDIT_LOG), async (req, res) => {
    try {
      const stats = await getAuditLogStats();
      res.json(stats);
    } catch (error) {
      logger.error({ err: error }, 'Get audit stats error');
      res.status(500).json({ message: "Erreur lors de la récupération des statistiques" });
    }
  });

  // Manual Purge Audit Logs (admin only)
  app.post("/api/audit-logs/purge", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.AUDIT_LOG), async (req, res) => {
    try {
      const result = await purgeOldAuditLogs();

      if (result.error) {
        return res.status(500).json({ message: result.error });
      }

      await logAudit(
        req,
        "PURGE_AUDIT_LOGS",
        "audit",
        undefined,
        { deletedCount: result.deletedCount },
        "success",
        "critical"
      );

      res.json({
        message: `Purge terminée. ${result.deletedCount} logs supprimés.`,
        deletedCount: result.deletedCount
      });
    } catch (error) {
      logger.error({ err: error }, 'Purge audit logs error');
      res.status(500).json({ message: "Erreur lors de la purge des logs" });
    }
  });

  // ============================================
  // P1.3: CONSOLIDATED ADMIN DASHBOARD STATS
  // Single endpoint to reduce HTTP round-trips (3 calls → 1)
  // ============================================

  app.get("/api/admin/dashboard-stats", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.USER), async (req, res) => {
    try {
      const startTime = Date.now();

      // Parallel fetch: users, audit logs, and system health
      const [allUsers, auditLogs, dbHealthResult] = await Promise.all([
        // 1. Get all users with roles
        (async () => {
          const users = await storage.getAllUsers();
          // Deduplicate and enrich with roles
          const uniqueUsers = Array.from(new Set(users.map((u: any) => u.id)))
            .map(id => users.find((u: any) => u.id === id));

          return Promise.all(uniqueUsers.map(async (u: any) => {
            const effectiveRole = await getEffectiveRole(u.id);
            return { ...u, role: effectiveRole };
          }));
        })(),

        // 2. Get recent audit logs (last 50)
        getAuditLogs({ limit: 50 }),

        // 3. Database health check
        (async () => {
          const dbStart = Date.now();
          try {
            await db.execute(sql`SELECT 1`);
            return { healthy: true, responseTime: Date.now() - dbStart };
          } catch {
            return { healthy: false, responseTime: Date.now() - dbStart };
          }
        })(),
      ]);

      // Calculate user statistics
      const totalUsers = allUsers.length;
      const activeUsers = allUsers.filter((u: any) => u.statut === StatutUser.ACTIVE).length;
      const inactiveUsers = totalUsers - activeUsers;

      // Count by role
      const activeRoles: Record<string, number> = {};
      allUsers.forEach((u: any) => {
        if (u.role) activeRoles[u.role] = (activeRoles[u.role] || 0) + 1;
      });

      // Today's activity
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayLogs = auditLogs.filter((log: any) => new Date(log.createdAt || log.created_at) >= today);
      const todayLogins = todayLogs.filter((log: any) => log.action === 'LOGIN' || log.action === 'login').length;
      const todayOperations = todayLogs.length;

      // Format recent activity
      const recentActivity = auditLogs.map((log: any) => {
        let detailsStr = '';
        if (typeof log.details === 'string') {
          detailsStr = log.details;
        } else if (typeof log.details === 'object' && log.details !== null) {
          detailsStr = Object.values(log.details).filter(v => typeof v === 'string' || typeof v === 'number').join(' - ') || JSON.stringify(log.details);
        }

        return {
          id: log.id,
          user_name: log.userName || log.user_name || 'Système',
          action: String(log.action || 'Action inconnue'),
          details: detailsStr,
          created_at: log.createdAt || log.created_at,
          ip_address: log.ipAddress || log.ip_address
        };
      });

      // System health info
      const memoryUsage = process.memoryUsage();
      const memoryPercent = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);
      const uptimeSeconds = Math.floor(process.uptime());
      const uptimeFormatted = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`;

      const systemHealth = {
        database: dbHealthResult.healthy ? 'healthy' as const : 'error' as const,
        security: 'secure' as const,
        dbResponseTime: dbHealthResult.responseTime,
        serverUptime: uptimeFormatted,
        memoryPercent,
      };

      res.json({
        totalUsers,
        activeUsers,
        inactiveUsers,
        todayLogins,
        todayOperations,
        activeRoles,
        recentActivity,
        systemHealth,
        _meta: {
          responseTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Admin dashboard stats error');
      res.status(500).json({ message: "Erreur lors de la récupération des statistiques" });
    }
  });

  // ============================================
  // SESSION MANAGEMENT - Force logout a user
  // ============================================

  app.post("/api/sessions/:userId/terminate", requireAuth, attachAbility, requireAbility(Actions.TERMINATE, Subjects.SESSION), async (req, res) => {
    try {
      const { userId } = req.params;
      const adminUser = req.session.user;

      logger.debug({
        targetUserId: userId,
        adminUserId: adminUser?.id,
        adminUsername: adminUser?.username,
      }, 'Session terminate request received');

      // Cannot terminate own session
      if (userId === adminUser?.id) {
        logger.warn({ adminUserId: adminUser?.id }, 'Blocked: Admin trying to terminate own session');
        return res.status(400).json({ message: "Vous ne pouvez pas terminer votre propre session" });
      }

      // Delete from active_sessions table
      const deletedCount = await deleteUserSessions(userId);

      // Also delete from PostgreSQL session store (express-session table)
      await db.execute(`
        DELETE FROM session
        WHERE sess::text LIKE '%"userId":"${userId}"%'
      `);

      // Notify the user via WebSocket to logout immediately
      try {
        const { getWsInstance } = await import("../ws-server");
        const wsInstance = getWsInstance();
        if (wsInstance) {
          wsInstance.sendToUser(userId, {
            type: "FORCE_LOGOUT",
            payload: {
              userId,
              reason: "Votre session a été terminée par un administrateur",
              forceLogout: true
            }
          });
        }
      } catch (wsError) {
        logger.error({ err: wsError }, 'WebSocket notification failed');
      }

      await logAudit(
        req,
        "FORCE_LOGOUT",
        "session",
        userId,
        { terminatedBy: adminUser?.id, adminName: adminUser?.nom, sessionsDeleted: deletedCount },
        "success",
        "high"
      );

      logger.info({ userId, deletedCount }, 'Session terminate success');
      res.json({ message: "Session terminée avec succès", deletedCount });
    } catch (error) {
      logger.error({ err: error }, 'Terminate session error');
      res.status(500).json({ message: "Erreur lors de la terminaison de la session" });
    }
  });

  // Get active sessions (from active_sessions table with real-time tracking)
  app.get("/api/sessions/active", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.SESSION), async (req, res) => {
    try {
      const sessions = await getActiveSessions();

      // Transform to expected format
      const formattedSessions = sessions.map(s => {
        const now = Date.now();
        const lastActivityTime = new Date(s.lastActivity).getTime();
        const timeSinceActivity = (now - lastActivityTime) / 1000 / 60; // minutes

        // Determine status based on last activity
        let status: 'active' | 'idle' = 'active';
        if (timeSinceActivity > 5) status = 'idle';

        return {
          id: s.id,
          sessionId: s.sessionId,
          userId: s.userId,
          user: {
            nom: s.userName,
            prenom: s.userPrenom,
            email: s.userEmail,
            role: s.userRole,
            agence: s.userAgence,
          },
          ipAddress: s.ipAddress,
          userAgent: s.userAgent,
          deviceType: s.deviceType,
          browser: s.browser,
          os: s.os,
          location: s.location,
          loginAt: s.loginAt,
          lastActivity: s.lastActivity,
          expiresAt: s.expiresAt,
          status,
          sessionDuration: Math.round((now - new Date(s.loginAt).getTime()) / 1000 / 60), // minutes
        };
      });

      res.json(formattedSessions);
    } catch (error) {
      logger.error({ err: error }, 'Get active sessions error');
      res.status(500).json({ message: "Erreur lors de la récupération des sessions" });
    }
  });

  // ============================================
  // USER PERMISSIONS MANAGEMENT
  // ============================================

  // Get all permissions for a user
  app.get("/api/users/:userId/permissions", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.PERMISSION), async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Fetch granular permissions with explicit join alias if needed, or just map manually
      // We join userPermissions -> permissions -> modules
      const userPerms = await db.select({
        code: permissions.code,
        moduleName: modules.name,
        granted: userPermissions.granted
      })
      .from(userPermissions)
      .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
      .leftJoin(modules, eq(permissions.moduleId, modules.id))
      .where(eq(userPermissions.userId, userId));

      // Transform to a map by module for legacy frontend usage
      const permissionsMap: Record<string, any> = {};
      
      // Helper to init module entry
      const getOrCreateModule = (name: string) => {
        if (!permissionsMap[name]) {
          permissionsMap[name] = {
            module_name: name,
            peut_voir: false,
            peut_creer: false,
            peut_modifier: false,
            peut_supprimer: false,
            peut_valider: false,
            peut_exporter: false
          };
        }
        return permissionsMap[name];
      };

      userPerms.forEach(p => {
        if (!p.granted) return;
        const entry = getOrCreateModule(p.moduleName || 'Unknown');
        const [, action] = p.code.split('.');
        
        // Map granular action to legacy flag
        switch (action) {
          case 'view': entry.peut_voir = true; break;
          case 'create': entry.peut_creer = true; break;
          case 'edit': entry.peut_modifier = true; break;
          case 'delete': entry.peut_supprimer = true; break;
          case 'approve': entry.peut_valider = true; break;
          case 'export': entry.peut_exporter = true; break;
        }
      });

      // Check for Caisse assignments and inject permission
      const assignments = await storage.getUserCaisseAssignments(userId);
      if (assignments && assignments.length > 0) {
          // If assigned to at least one caisse, grant view/create permissions for Caisse module
          const entry = getOrCreateModule('Caisse');
          entry.peut_voir = true;
          entry.peut_creer = true; // Needed to open session
          entry.peut_valider = true;
      }

      res.json(permissionsMap);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching permissions');
      res.status(500).json({ message: "Erreur lors de la récupération des permissions" });
    }
  });

  // Save/Update permissions for a user (batch update - Legacy Adapter)
  app.put("/api/users/:userId/permissions", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.PERMISSION), async (req, res) => {
    try {
      const { userId } = req.params;
      const permissionsData: Record<string, {
        peut_voir: boolean;
        peut_creer: boolean;
        peut_modifier: boolean;
        peut_supprimer: boolean;
        peut_valider: boolean;
        peut_exporter: boolean;
      }> = req.body;

      // Verify user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }

      // Fetch all system permissions to map codes
      const allPerms = await db.select({
        id: permissions.id,
        code: permissions.code,
        moduleName: modules.name
      })
      .from(permissions)
      .leftJoin(modules, eq(permissions.moduleId, modules.id));

      // Build list of permission IDs to grant
      const permissionIdsToGrant: string[] = [];

      Object.entries(permissionsData).forEach(([moduleName, flags]) => {
         const modulePerms = allPerms.filter(p => p.moduleName === moduleName);
         modulePerms.forEach(p => {
            const [, action] = p.code.split('.');
            let shouldGrant = false;
            switch(action) {
               case 'view': shouldGrant = flags.peut_voir; break;
               case 'create': shouldGrant = flags.peut_creer; break;
               case 'edit': shouldGrant = flags.peut_modifier; break;
               case 'delete': shouldGrant = flags.peut_supprimer; break;
               case 'approve': shouldGrant = flags.peut_valider; break;
               case 'export': shouldGrant = flags.peut_exporter; break;
            }
            if (shouldGrant) {
               permissionIdsToGrant.push(p.id);
            }
         });
      });

      // Transaction-like update: delete all for user then insert
      // Note: We only delete/replace permissions that match the legacy flags logic?
      // Or just wipe all and set new state? The endpoint implies full state update.
      // So we delete all custom permissions.
      
      await db.delete(userPermissions).where(eq(userPermissions.userId, userId));

      if (permissionIdsToGrant.length > 0) {
        const values = permissionIdsToGrant.map(pid => ({
           userId,
           permissionId: pid,
           granted: true
        }));
        await db.insert(userPermissions).values(values);
      }

      await logAudit(
        req,
        "UPDATE_PERMISSIONS",
        "user_permissions",
        userId,
        { modules: Object.keys(permissionsData) },
        "success",
        "high"
      );

      res.json({ message: "Permissions mises à jour avec succès", count: permissionIdsToGrant.length });
    } catch (error) {
      logger.error({ err: error }, 'Error saving permissions');
      res.status(500).json({ message: "Erreur lors de la sauvegarde des permissions" });
    }
  });

  // Check if current user has a specific permission
  app.get("/api/permissions/check", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { module, action } = req.query;

      if (!module || !action) {
        return res.status(400).json({ message: "Module et action requis" });
      }
      
      // Construct expected code (simple heuristic, might need refinement if 'module' param != module name)
      // Usually module param here is 'Caisse', 'Clients' etc. or 'caisse', 'clients'.
      // Code convention is lowercase: 'caisse.view'.
      const expectedCode = `${(module as string).toLowerCase()}.${(action as string).toLowerCase()}`;

      // Admins have all permissions
      if (isAdminRole(user.role)) {
        return res.json({ allowed: true });
      }

      // Check user-specific permissions
      // Join userPermissions -> permissions
      const [permission] = await db.select()
        .from(userPermissions)
        .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
        .where(and(
          eq(userPermissions.userId, user.id),
          eq(permissions.code, expectedCode),
          eq(userPermissions.granted, true)
        ));

      if (!permission) {
        // Check dynamic assignments for Caisse module
        if (module === 'Caisse' || module === 'caisse') {
             const userId = user.id;
             const assignments = await storage.getUserCaisseAssignments(userId);
             if (assignments && assignments.length > 0) {
                 // Assigned users can view and create (open sessions)
                 if (['view', 'create', 'open'].includes(action as string)) {
                     return res.json({ allowed: true });
                 }
             }
        }
        return res.json({ allowed: false });
      }

      // Permission found and granted=true (checked in query at line 853)
      // No need to check individual fields - the existence of the permission means it's allowed
      res.json({ allowed: true });
    } catch (error) {
      logger.error({ err: error }, 'Error checking permission');
      res.status(500).json({ message: "Erreur lors de la vérification des permissions" });
    }
  });

  // ============================================
  // CAISSE SUPERVISOR PIN AUTHENTICATION
  // ============================================

  // Verify supervisor credentials + PIN for caisse opening
  app.post("/api/auth/verify-supervisor", async (req, res) => {
    try {
      const { username, password, pin } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "Identifiants requis" });
      }

      // Verify user credentials
      const user = await loginUser(username, password);
      if (!user) {
        return res.status(401).json({ message: "Identifiants incorrects" });
      }

      // Check if user has supervisor role (Architecture V3: via userRoles)
      const effectiveRole = await getEffectiveRole(user.id);
      const supervisorRoles = [SystemRole.ADMIN, SystemRole.CHEF_AGENCE];
      if (!supervisorRoles.includes(effectiveRole)) {
        return res.status(403).json({ message: "Rôle insuffisant. Seul un superviseur peut autoriser l'ouverture." });
      }

      // Architecture V3: caissePin est dans employes
      const caissePin = await getUserCaissePin(user.id);

      // If PIN provided, verify it
      if (pin) {
        if (!caissePin) {
          return res.status(400).json({ message: "Aucun PIN configuré. Veuillez définir votre PIN caisse.", requirePinSetup: true });
        }
        const pinValid = await comparePasswords(pin, caissePin);
        if (!pinValid) {
          return res.status(401).json({ message: "PIN incorrect" });
        }
      }

      // Return supervisor info
      res.json({
        id: user.id,
        name: `${user.prenom || ''} ${user.nom}`.trim(),
        phone: user.telephone,
        role: effectiveRole,
        hasPinConfigured: !!caissePin
      });

    } catch (error) {
      logger.error({ err: error }, 'Verify supervisor error');
      res.status(500).json({ message: "Erreur de vérification" });
    }
  });

  // Set/Update own caisse PIN (Admins/Chefs only)
  app.put("/api/auth/caisse-pin", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user!.id;
      const userRole = req.session.user!.role;
      const { currentPassword, newPin } = req.body;

      // Restrict to admins and chefs
      const normalizedRole = normalizeRole(userRole);
      const authorizedRoles = [SystemRole.ADMIN, SystemRole.CHEF_AGENCE];
      if (!normalizedRole || !authorizedRoles.includes(normalizedRole)) {
        return res.status(403).json({ message: "Action non autorisée. Seuls les Administrateurs et Chefs d'Agence peuvent modifier leur propre PIN." });
      }

      if (!currentPassword || !newPin) {
        return res.status(400).json({ message: "Mot de passe actuel et nouveau PIN requis" });
      }

      // Validate PIN format (6 digits)
      if (!/^\d{6}$/.test(newPin)) {
        return res.status(400).json({ message: "Le PIN doit contenir exactement 6 chiffres" });
      }

      // Verify current password
      const user = await storage.getUser(userId);
      if (!user || !user.password) return res.status(404).json({ message: "Utilisateur non trouvé" });

      const passwordValid = await comparePasswords(currentPassword, user.password);
      if (!passwordValid) {
        return res.status(401).json({ message: "Mot de passe incorrect" });
      }

      // Architecture V3: caissePin dans employes
      const hashedPin = await hashPassword(newPin);
      await setUserCaissePin(userId, hashedPin);

      await logAudit(req, "SET_OWN_CAISSE_PIN", "user", userId, undefined, "success", "high");

      res.json({ message: "PIN caisse configuré avec succès" });
    } catch (error) {
      logger.error({ err: error }, 'Set caisse PIN error');
      res.status(500).json({ message: "Erreur lors de la configuration du PIN" });
    }
  });

  // Set/Update caisse PIN for another user (Admin/Chef only)
  app.put("/api/users/:targetId/caisse-pin", requireAuth, async (req, res) => {
    try {
      const adminId = req.session.user!.id;
      const adminRole = req.session.user!.role;
      const targetId = req.params.targetId;
      const { pin } = req.body;

      // Restrict to admins and chefs
      const normalizedRole = normalizeRole(adminRole);
      const authorizedRoles = [SystemRole.ADMIN, SystemRole.CHEF_AGENCE];
      if (!normalizedRole || !authorizedRoles.includes(normalizedRole)) {
        return res.status(403).json({ message: "Action non autorisée. Rôle insuffisant." });
      }

      if (!pin) {
        return res.status(400).json({ message: "Nouveau PIN requis" });
      }

      // Validate PIN format (6 digits)
      if (!/^\d{6}$/.test(pin)) {
        return res.status(400).json({ message: "Le PIN doit contenir exactement 6 chiffres" });
      }

      // Architecture V3: caissePin dans employes
      const hashedPin = await hashPassword(pin);
      await setUserCaissePin(targetId, hashedPin);

      await logAudit(req, "SET_USER_CAISSE_PIN", "user", targetId, { adminId }, "success", "critical");

      res.json({ message: "PIN utilisateur configuré avec succès" });
    } catch (error) {
      logger.error({ err: error }, 'Set user caisse PIN error');
      res.status(500).json({ message: "Erreur lors de la configuration du PIN utilisateur" });
    }
  });

  // ============================================
  // User Roles Management (Architecture V3)
  // ============================================

  /**
   * GET /api/users/:userId/roles - Récupérer tous les rôles d'un utilisateur
   */
  app.get("/api/users/:userId/roles", requireAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      const requesterId = req.session.user!.id;
      const requesterRole = req.session.user!.role;

      // Un utilisateur peut voir ses propres rôles, sinon il faut être admin/chef
      if (userId !== requesterId) {
        const normalizedRole = normalizeRole(requesterRole);
        const authorizedRoles = [SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.SUPERVISEUR];
        if (!normalizedRole || !authorizedRoles.includes(normalizedRole)) {
          return res.status(403).json({ error: "Non autorisé à voir les rôles de cet utilisateur" });
        }
      }

      const roles = await db.select({
        id: userRoles.id,
        role: userRoles.role,
        agenceId: userRoles.agenceId,
        isPrimary: userRoles.isPrimary,
        createdAt: userRoles.createdAt,
      })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));

      // Enrichir avec le nom de l'agence si disponible
      const enrichedRoles = await Promise.all(roles.map(async (r) => {
        let agenceNom = null;
        if (r.agenceId) {
          const [agence] = await db.select({ nom: agences.nom }).from(agences).where(eq(agences.id, r.agenceId));
          agenceNom = agence?.nom || null;
        }
        return {
          ...r,
          agenceNom,
        };
      }));

      res.json(enrichedRoles);
    } catch (error) {
      logger.error({ err: error }, 'Get user roles error');
      res.status(500).json({ error: "Erreur lors de la récupération des rôles" });
    }
  });

  /**
   * POST /api/users/:userId/roles - Ajouter un rôle à un utilisateur
   */
  app.post("/api/users/:userId/roles", requireAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      const { role, agenceId, isPrimary } = req.body;
      const adminRole = req.session.user!.role;

      // Seuls les admins peuvent ajouter des rôles
      const normalizedRole = normalizeRole(adminRole);
      if (!normalizedRole || !isAdminRole(normalizedRole)) {
        return res.status(403).json({ error: "Seuls les administrateurs peuvent ajouter des rôles" });
      }

      if (!role || !Object.values(SystemRole).includes(role)) {
        return res.status(400).json({ error: "Rôle invalide" });
      }

      // Vérifier que l'utilisateur existe
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return res.status(404).json({ error: "Utilisateur non trouvé" });
      }

      // Ajouter le rôle
      const [newRole] = await db.insert(userRoles).values({
        userId,
        role,
        agenceId: agenceId || null,
        isPrimary: isPrimary || false,
      }).returning();

      await logAudit(req, "ADD_USER_ROLE", "user", userId, { role, agenceId }, "success", "high");

      res.status(201).json(newRole);
    } catch (error: any) {
      if (error.code === '23505') { // Unique violation
        return res.status(409).json({ error: "Ce rôle existe déjà pour cet utilisateur et cette agence" });
      }
      logger.error({ err: error }, 'Add user role error');
      res.status(500).json({ error: "Erreur lors de l'ajout du rôle" });
    }
  });

  /**
   * DELETE /api/users/:userId/roles/:roleId - Supprimer un rôle
   */
  app.delete("/api/users/:userId/roles/:roleId", requireAuth, async (req, res) => {
    try {
      const { userId, roleId } = req.params;
      const adminRole = req.session.user!.role;

      // Seuls les admins peuvent supprimer des rôles
      const normalizedRole = normalizeRole(adminRole);
      if (!normalizedRole || !isAdminRole(normalizedRole)) {
        return res.status(403).json({ error: "Seuls les administrateurs peuvent supprimer des rôles" });
      }

      // Vérifier que le rôle appartient bien à l'utilisateur
      const [existingRole] = await db.select()
        .from(userRoles)
        .where(and(eq(userRoles.id, roleId), eq(userRoles.userId, userId)));

      if (!existingRole) {
        return res.status(404).json({ error: "Rôle non trouvé" });
      }

      // Ne pas permettre de supprimer le dernier rôle
      const [roleCount] = await db.select({ count: userRoles.id })
        .from(userRoles)
        .where(eq(userRoles.userId, userId));

      // @ts-ignore - count returns a string
      if (parseInt(roleCount?.count || '0') <= 1) {
        return res.status(400).json({ error: "Impossible de supprimer le dernier rôle d'un utilisateur" });
      }

      await db.delete(userRoles).where(eq(userRoles.id, roleId));

      await logAudit(req, "REMOVE_USER_ROLE", "user", userId, { roleId, role: existingRole.role }, "success", "high");

      res.json({ message: "Rôle supprimé avec succès" });
    } catch (error) {
      logger.error({ err: error }, 'Delete user role error');
      res.status(500).json({ error: "Erreur lors de la suppression du rôle" });
    }
  });

  /**
   * PUT /api/users/:userId/roles/:roleId/primary - Définir un rôle comme principal
   */
  app.put("/api/users/:userId/roles/:roleId/primary", requireAuth, async (req, res) => {
    try {
      const { userId, roleId } = req.params;
      const requesterId = req.session.user!.id;
      const requesterRole = req.session.user!.role;

      // Un utilisateur peut changer son propre rôle principal, sinon il faut être admin
      if (userId !== requesterId) {
        const normalizedRole = normalizeRole(requesterRole);
        if (!normalizedRole || !isAdminRole(normalizedRole)) {
          return res.status(403).json({ error: "Non autorisé à modifier les rôles de cet utilisateur" });
        }
      }

      // Vérifier que le rôle appartient à l'utilisateur
      const [existingRole] = await db.select()
        .from(userRoles)
        .where(and(eq(userRoles.id, roleId), eq(userRoles.userId, userId)));

      if (!existingRole) {
        return res.status(404).json({ error: "Rôle non trouvé" });
      }

      // Transaction: désactiver les autres rôles principaux et activer celui-ci
      await db.transaction(async (tx) => {
        await tx.update(userRoles)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(and(eq(userRoles.userId, userId), eq(userRoles.isPrimary, true)));

        await tx.update(userRoles)
          .set({ isPrimary: true, updatedAt: new Date() })
          .where(eq(userRoles.id, roleId));
      });

      await logAudit(req, "SET_PRIMARY_ROLE", "user", userId, { roleId, role: existingRole.role }, "success", "medium");

      res.json({ message: "Rôle principal mis à jour" });
    } catch (error) {
      logger.error({ err: error }, 'Set primary role error');
      res.status(500).json({ error: "Erreur lors de la mise à jour du rôle principal" });
    }
  });

  /**
   * GET /api/my-roles - Récupérer ses propres rôles (raccourci)
   */
  app.get("/api/my-roles", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user!.id;

      const roles = await db.select({
        id: userRoles.id,
        role: userRoles.role,
        agenceId: userRoles.agenceId,
        isPrimary: userRoles.isPrimary,
      })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));

      res.json(roles);
    } catch (error) {
      logger.error({ err: error }, 'Get my roles error');
      res.status(500).json({ error: "Erreur lors de la récupération des rôles" });
    }
  });
}
