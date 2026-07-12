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

export function registerUsersRoutes(app: Express) {
  app.post("/api/auth/register", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.USER), async (req, res) => {
    // Capture fields before schema parsing (insertUserSchema strips unknown fields)
    const tempEntityId = req.body?.tempEntityId || req.body?.temp_entity_id;
    const autoGeneratePassword = req.body?.autoGeneratePassword === true;

    try {
      const normalizedBody = normalizeUserPayload(req.body);

      // Auto-generate password if requested
      let clearTextPassword: string | null = null;
      if (autoGeneratePassword || !normalizedBody.password) {
        clearTextPassword = generateSecurePassword();
        normalizedBody.password = clearTextPassword;
        normalizedBody.mustChangePassword = true; // Force change on first login
        logger.info({ username: normalizedBody.username }, 'Auto-generated password for new user');
      }

      // Validate complexity
      if (normalizedBody.password) {
          const requirements = await getPasswordRequirements();
          const validation = validatePassword(normalizedBody.password, requirements);
          if (!validation.valid) return res.status(400).json(validation);
      }

      // Remove non-schema fields before parsing
      delete normalizedBody.autoGeneratePassword;

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

      await logAudit(
        req,
        "CREATE_USER",
        "user",
        user.id,
        { username: user.username, autoGenerated: !!clearTextPassword },
        "success",
        "medium"
      );

      // Domain event: user registered — includes credentials for notification if auto-generated
      dispatchDomainEvent({
        type: "USER_REGISTERED",
        data: {
          userId: user.id,
          username: user.username || "",
          nom: user.nom || "",
          prenom: user.prenom || undefined,
          email: user.email || undefined,
          telephone: user.telephone || undefined,
          generatedPassword: clearTextPassword || undefined,
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
}
