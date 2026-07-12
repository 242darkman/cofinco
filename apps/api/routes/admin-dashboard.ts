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

export function registerAdminDashboardRoutes(app: Express) {
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
      // Memory: real system RAM via os module
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const memoryPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

      const uptimeSeconds = Math.floor(process.uptime());
      const uptimeFormatted = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`;

      // Security: real check — count failed login attempts in last 15 min
      let securityStatus: 'secure' | 'warning' | 'critical' = 'secure';
      let failedLoginsLast15m = 0;
      try {
        const windowStart = new Date(Date.now() - 15 * 60 * 1000);
        const [result] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(loginAttempts)
          .where(
            and(
              eq(loginAttempts.success, false),
              gte(loginAttempts.createdAt, windowStart)
            )
          );
        failedLoginsLast15m = result?.count ?? 0;
        if (failedLoginsLast15m >= 20) {
          securityStatus = 'critical';
        } else if (failedLoginsLast15m >= 5) {
          securityStatus = 'warning';
        }
      } catch {
        // If query fails, keep 'secure' as default
      }

      const systemHealth = {
        database: dbHealthResult.healthy ? 'healthy' as const : 'error' as const,
        security: securityStatus,
        failedLoginsLast15m,
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

}
