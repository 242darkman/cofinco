import type { Express } from "express";
import { insertUserSchema, users, userPermissions, modules, permissions, userAgences, agences, userRoles, employes, activeSessions } from "@shared/schema";
import { SystemRole } from "@shared/types/roles";
import { storage } from "../../storage";
import { getClientByUserId } from "../../storage/clients";
import { loginUser, registerUser, requireAuth, hashPassword, comparePasswords, SESSION_CONFIG, getRedisClient, sessionStoreType } from "../../auth";
import { attachAbility, requireAbility, requireResetPassword, getAbilityForUser } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit, logLoginAttempt, getLoginLockoutInfo, validatePassword, getPasswordRequirements, getAuditLogs, clearLoginAttemptsOnSuccess, purgeOldAuditLogs, getAuditLogStats } from "../../audit";
import { createSessionRecord, deleteSessionRecord, deleteUserSessions, getActiveSessions, isSessionValid, markSessionInactive, markUserSessionsInactive, sessionGuard, enforceSessionLimit, countUserSessions, getUserSessions, getMaxSessionsPerUser, scanAndCleanupRedisSessions } from "../../session-tracker";
import { getPermissionsForUser } from "../../services/permissions-service";
import refreshTokenService, { REFRESH_TOKEN_COOKIE_NAME } from "../../services/refresh-token-service";
import { requestOtp, verifyOtp, OtpRateLimitError } from "../../services/notifications/otp/otp-service";
import { z } from "zod";
import { eq, and, asc, desc, gte, sql } from "drizzle-orm";
import os from "os";
import { db, withTimeout } from "../../db";
import { loginAttempts } from "@shared/schema";
import { StatutUser } from "@shared/enum/status-constants";

// Timeouts pour les opérations critiques (en ms)
const LOGIN_TIMEOUT_MS = 15000;      // 15 secondes max pour tout le processus de login
const DB_OPERATION_TIMEOUT_MS = 5000; // 5 secondes max par opération DB
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { StorageService } from "../../services/storage-service";
import { createLogger } from "../../lib/logger";
import { caisseAdminService } from "../../services/caisse-admin-service";

import crypto from "crypto";

const logger = createLogger('Auth');

import { generateSecurePassword, resolveUserContexts, getUserCaissePin, setUserCaissePin, getEffectiveRole, getUserRoles, normalizeUserPayload, resolvePrimaryAgence } from "./helpers";


/**
 * Routes de cycle de vie de session (info, extension, logout).
 * Extrait de core.ts pour respecter la limite de 400 lignes.
 */
export function registerAuthSessionRoutes(app: Express) {
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

      // Calcul du temps restant (basé sur le cookie, 2 heures glissantes pour la microfinance)
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
   * Prolonge la session en la touchant (met à jour lastActivity)
   */
  app.post("/api/auth/extend-session", requireAuth, async (req, res) => {
    try {
      const sessionId = req.sessionID;
      const userId = req.session.user!.id;

      // Mise à jour de l'activité de session (ceci prolonge la session glissante)
      await db.update(activeSessions)
        .set({ lastActivity: new Date() })
        .where(eq(activeSessions.sessionId, sessionId));

      // Toucher la session express pour rafraîchir le cookie
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
  // REFRESH TOKEN (Se souvenir de moi)
  // ============================================

  /**
   * POST /api/auth/refresh
   * Utilise un refresh token pour créer une nouvelle session (fonctionnalité Se souvenir de moi)
   * Le refresh token est envoyé sous forme de cookie HTTP-only
   */
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

    // Forcer la fermeture de toute session de caisse ouverte pour cet utilisateur
    if (userId) {
      try {
        await caisseAdminService.forceCloseOnLogout(userId);
      } catch (err) {
        logger.error({ err, userId }, 'Error force-closing caisse on logout');
      }
    }

    // Supprimer de la table active_sessions + Redis + ZSET
    if (sessionId) {
      await deleteSessionRecord(sessionId, userId);
    }

    // Révoquer tout refresh token (se souvenir de moi)
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

}
