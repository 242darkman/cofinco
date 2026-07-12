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

export function registerUsersPermissionsRoutes(app: Express) {
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
      const user = req.user!;
      const { module, action } = req.query;

      if (!module || !action) {
        return res.status(400).json({ message: "Module et action requis" });
      }

      // Construct expected code (simple heuristic, might need refinement if 'module' param != module name)
      // Usually module param here is 'Caisse', 'Clients' etc. or 'caisse', 'clients'.
      // Code convention is lowercase: 'caisse.view'.
      const expectedCode = `${(module as string).toLowerCase()}.${(action as string).toLowerCase()}`;

      // Admins have all permissions
      if (user.role === SystemRole.ADMIN) {
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
  app.get("/api/users/:userId/roles", requireAuth, attachAbility, async (req, res) => {
    try {
      const { userId } = req.params;
      const requesterId = req.session.user!.id;

      // Un utilisateur peut voir ses propres rôles, sinon il faut MANAGE_ROLES
      if (userId !== requesterId) {
        if (!req.ability?.can(Actions.MANAGE_ROLES, Subjects.USER)) {
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
  app.post("/api/users/:userId/roles", requireAuth, attachAbility, requireAbility(Actions.MANAGE_ROLES, Subjects.USER), async (req, res) => {
    try {
      const { userId } = req.params;
      const { role, agenceId, isPrimary } = req.body;

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
  app.delete("/api/users/:userId/roles/:roleId", requireAuth, attachAbility, requireAbility(Actions.MANAGE_ROLES, Subjects.USER), async (req, res) => {
    try {
      const { userId, roleId } = req.params;

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
  app.put("/api/users/:userId/roles/:roleId/primary", requireAuth, attachAbility, async (req, res) => {
    try {
      const { userId, roleId } = req.params;
      const requesterId = req.session.user!.id;

      // Un utilisateur peut changer son propre rôle principal, sinon il faut MANAGE_ROLES
      if (userId !== requesterId) {
        if (!req.ability?.can(Actions.MANAGE_ROLES, Subjects.USER)) {
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
}
