import type { Express } from "express";
import { insertUserSchema, users, userPermissions, modules, permissions, userAgences, agences, userRoles, employes, activeSessions } from "@shared/schema";
import { SystemRole } from "@shared/types/roles";
import { storage } from "../storage";
import { getClientByUserId } from "../storage/clients";
import { loginUser, registerUser, requireAuth, hashPassword, comparePasswords, SESSION_CONFIG, getRedisClient, sessionStoreType } from "../auth";
import { attachAbility, requireAbility, requireResetPassword, getAbilityForUser } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit, logLoginAttempt, getLoginLockoutInfo, validatePassword, getPasswordRequirements, getAuditLogs, clearLoginAttemptsOnSuccess, purgeOldAuditLogs, getAuditLogStats } from "../audit";
import { createSessionRecord, deleteSessionRecord, deleteUserSessions, getActiveSessions, isSessionValid, markSessionInactive, markUserSessionsInactive, sessionGuard, enforceSessionLimit, countUserSessions, getUserSessions, getMaxSessionsPerUser, scanAndCleanupRedisSessions } from "../session-tracker";
import { getPermissionsForUser } from "../services/permissions-service";
import refreshTokenService, { REFRESH_TOKEN_COOKIE_NAME } from "../services/refresh-token-service";
import { requestOtp, verifyOtp, OtpRateLimitError } from "../services/notifications/otp/otp-service";
import { z } from "zod";
import { eq, and, asc, desc, gte, sql } from "drizzle-orm";
import os from "os";
import { db, withTimeout } from "../db";
import { loginAttempts } from "@shared/schema";
import { StatutUser } from "@shared/enum/status-constants";

// Timeouts pour les opérations critiques (en ms)
const LOGIN_TIMEOUT_MS = 15000;      // 15 secondes max pour tout le processus de login
const DB_OPERATION_TIMEOUT_MS = 5000; // 5 secondes max par opération DB
import { dispatchDomainEvent } from "../services/notifications/domain-events/event-registry";
import { StorageService } from "../services/storage-service";
import { createLogger } from "../lib/logger";
import { caisseAdminService } from "../services/caisse-admin-service";

import crypto from "crypto";

const logger = createLogger('Auth');

import { generateSecurePassword, resolveUserContexts, getUserCaissePin, setUserCaissePin, getEffectiveRole, getUserRoles, normalizeUserPayload, resolvePrimaryAgence } from "./auth/helpers";

export function registerSessionsRoutes(app: Express) {
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
  // SESSION METRICS (Admin observability)
  // ============================================

  /**
   * GET /api/admin/session-metrics
   * Retourne des métriques d'observabilité sur l'état des sessions (admin uniquement).
   * Inclut : sessions actives, distribution par user, métriques Redis, config.
   */
  app.get("/api/admin/session-metrics", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.SESSION), async (req, res) => {
    try {
      // 1. Métriques DB
      const [dbMetrics] = await db.select({
        totalActive: sql<number>`count(*) filter (where ${activeSessions.isActive} = true)`,
        totalInactive: sql<number>`count(*) filter (where ${activeSessions.isActive} = false)`,
        totalExpired: sql<number>`count(*) filter (where ${activeSessions.expiresAt} < now())`,
      }).from(activeSessions);

      // 2. Distribution par utilisateur (users avec sessions actives)
      const perUser = await db.select({
        userId: activeSessions.userId,
        userName: users.nom,
        userPrenom: users.prenom,
        count: sql<number>`count(*)`,
      })
      .from(activeSessions)
      .leftJoin(users, eq(activeSessions.userId, users.id))
      .where(eq(activeSessions.isActive, true))
      .groupBy(activeSessions.userId, users.nom, users.prenom);

      // 3. Métriques Redis (si disponible)
      let redisMetrics: any = null;
      const redis = getRedisClient();
      if (redis) {
        try {
          let sessionKeyCount = 0;
          for await (const _ of redis.scanIterator({ MATCH: 'microflex:sess:*', COUNT: 100 })) {
            sessionKeyCount++;
          }

          let zsetKeyCount = 0;
          for await (const _ of redis.scanIterator({ MATCH: 'microflex:usess:*', COUNT: 100 })) {
            zsetKeyCount++;
          }

          const info = await redis.info('memory');
          const usedMemoryMatch = info.match(/used_memory_human:(.+)/);

          redisMetrics = {
            sessionKeys: sessionKeyCount,
            userZsets: zsetKeyCount,
            memoryUsed: usedMemoryMatch?.[1]?.trim() || 'unknown',
            estimatedZombies: Math.max(0, sessionKeyCount - Number(dbMetrics.totalActive)),
          };
        } catch (redisErr) {
          redisMetrics = { error: 'Redis unavailable' };
        }
      }

      // 4. Sessions stale
      const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
      const [staleMetrics] = await db.select({
        staleCount: sql<number>`count(*) filter (where ${activeSessions.lastActivity} < ${staleThreshold} and ${activeSessions.isActive} = true)`,
      }).from(activeSessions);

      res.json({
        timestamp: new Date().toISOString(),
        sessionStoreType,
        database: {
          totalActive: Number(dbMetrics.totalActive),
          totalInactive: Number(dbMetrics.totalInactive),
          totalExpired: Number(dbMetrics.totalExpired),
          staleSessions: Number(staleMetrics.staleCount),
        },
        perUser: perUser.map(u => ({
          userId: u.userId,
          name: `${u.userPrenom || ''} ${u.userName || ''}`.trim(),
          activeSessions: Number(u.count),
        })),
        redis: redisMetrics,
        config: {
          maxSessionsPerUser: getMaxSessionsPerUser(),
          inactivityTimeoutMs: SESSION_CONFIG.INACTIVITY_TIMEOUT_MS,
          absoluteTimeoutMs: SESSION_CONFIG.ABSOLUTE_TIMEOUT_MS,
          staleThresholdMs: 5 * 60 * 1000,
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Error getting session metrics');
      res.status(500).json({ error: "Erreur lors de la récupération des métriques de session" });
    }
  });

  /**
   * POST /api/admin/session-cleanup
   * Déclenche manuellement le SCAN-based cleanup Redis et retourne les résultats.
   * Utile pour diagnostiquer les sessions zombies.
   */
  app.post("/api/admin/session-cleanup", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.SESSION), async (req, res) => {
    try {
      const result = await scanAndCleanupRedisSessions();
      if (!result) {
        return res.json({ message: "Redis non disponible — cleanup non applicable", storeType: sessionStoreType });
      }
      res.json({ message: "Cleanup Redis terminé", ...result });
    } catch (error) {
      logger.error({ err: error }, 'Error running manual session cleanup');
      res.status(500).json({ error: "Erreur lors du cleanup" });
    }
  });

  // ============================================
  // USER PERMISSIONS MANAGEMENT
  // ============================================

  // Get all permissions for a user
}
