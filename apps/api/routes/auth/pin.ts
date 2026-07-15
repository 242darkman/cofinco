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
 * Routes des PIN caisse (vérification, statut, superviseur, gestion).
 * Extrait de core.ts pour respecter la limite de 400 lignes.
 */
export function registerAuthPinRoutes(app: Express) {
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

  // Vérifier si l'utilisateur courant a un PIN configuré (aucun PIN requis)
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

      // Check if user has supervisor permission via CASL ability
      const effectiveRole = await getEffectiveRole(user.id);
      const ability = await getAbilityForUser({ userId: user.id });
      if (!ability.can(Actions.MANAGE, Subjects.CAISSE_SESSION)) {
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
  app.put("/api/auth/caisse-pin", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE_SESSION), async (req, res) => {
    try {
      const userId = req.session.user!.id;
      const { currentPassword, newPin } = req.body;

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
  app.put("/api/users/:targetId/caisse-pin", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.USER), async (req, res) => {
    try {
      const adminId = req.session.user!.id;
      const targetId = req.params.targetId;
      const { pin } = req.body;

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
}
