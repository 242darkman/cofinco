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

export function registerAuditLogsRoutes(app: Express) {
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

}
