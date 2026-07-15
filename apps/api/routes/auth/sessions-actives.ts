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
 * Routes de gestion des sessions actives (liste, révocation).
 * Extrait de profile.ts pour respecter la limite de 400 lignes.
 */
export function registerAuthActiveSessionsRoutes(app: Express) {
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

      // Marquer quelle session est la session courante
      const sessionsWithCurrent = sessions.map(s => ({
        ...s,
        isCurrent: s.sessionId === currentSessionId,
        // Masquer l'ID de session pour la sécurité (afficher seulement les 8 premiers caractères)
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
   * Révoquer une session spécifique (l'utilisateur ne peut révoquer que ses propres sessions)
   */
  app.delete("/api/auth/sessions/:sessionId", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user!.id;
      const { sessionId } = req.params;
      const currentSessionId = req.sessionID;

      // Impossible de révoquer la session courante (utiliser la déconnexion à la place)
      if (sessionId === currentSessionId) {
        return res.status(400).json({
          error: "Impossible de révoquer la session actuelle. Utilisez la déconnexion.",
        });
      }

      // Vérifier que la session appartient à l'utilisateur courant
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

      // Marquer la session comme inactive
      await db.update(activeSessions)
        .set({ isActive: false })
        .where(eq(activeSessions.sessionId, sessionId));

      // Notifier via WebSocket
      try {
        const { getWsInstance } = await import('../../ws-server');
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
        // La notification WebSocket est de type best-effort (non garantie)
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
   * Révoquer toutes les sessions sauf la courante (déconnexion de partout ailleurs)
   */
  app.delete("/api/auth/sessions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user!.id;
      const currentSessionId = req.sessionID;

      // Récupérer toutes les autres sessions
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

      // Marquer toutes les autres sessions comme inactives
      await db.update(activeSessions)
        .set({ isActive: false })
        .where(and(
          eq(activeSessions.userId, userId),
          sql`${activeSessions.sessionId} != ${currentSessionId}`
        ));

      // Notifier via WebSocket
      try {
        const { getWsInstance } = await import('../../ws-server');
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
        // La notification WebSocket est de type best-effort (non garantie)
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

}
