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


export function registerAuthProfileRoutes(app: Express) {
  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.user) return res.sendStatus(401);

    // Valider que la session est toujours active dans la base de données
    const validity = await isSessionValid(req.sessionID);
    if (!validity.valid) {
      logger.warn({ sessionId: req.sessionID, reason: validity.reason }, 'Session invalid');

      // Détruire la session
      req.session.destroy((err) => {
        if (err) logger.error({ err }, 'Error destroying invalid session');
      });

      return res.status(401).json({
        message: 'Session expired or invalidated',
        code: 'SESSION_INVALID',
        reason: validity.reason
      });
    }

    // Réparation automatique de la session si agenceId est manquant
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
    let userData: { photoProfile?: string | null; telephone?: string | null; adresse?: string | null; lieuNaissance?: string | null; nationaliteId?: string | null; paysNaissanceId?: string | null; sexe?: string | null; dateNaissance?: Date | null } = {};
    try {
      const user = await storage.getUser(req.session.user.id);
      if (user) {
        userData = {
          photoProfile: user.photoProfile,
          telephone: user.telephone,
          adresse: user.adresse,
          lieuNaissance: user.lieuNaissance,
          nationaliteId: user.nationaliteId,
          paysNaissanceId: user.paysNaissanceId,
          sexe: user.sexe,
          dateNaissance: user.dateNaissance,
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

    // Resolve available contexts (client / employee)
    const contexts = await resolveUserContexts(
      req.session.user.id,
      req.session.user.role
    );

    res.json({
      ...req.session.user,
      ...userData,
      ...employeData,
      sessionValid: true,
      availableContexts: contexts.availableContexts,
      defaultContext: contexts.defaultContext,
    });
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
      
      // Si le nom d'utilisateur est modifié, vérifier les doublons
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

      // Ajouter le nom d'utilisateur s'il est fourni et modifié
      if (username && username !== user.username) {
        updateData.username = username;
      }

      if (photoProfile !== undefined) {
        updateData.photoProfile = photoProfile;
      }

      // Nouveaux champs : dateNaissance, adresse, ville
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

}
