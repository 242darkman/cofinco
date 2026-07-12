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

  // ─── Multi-agency: list accessible agencies ───────────────────────────────
  app.get("/api/auth/my-agencies", requireAuth, async (req, res) => {
    try {
      const userId = req.session?.user?.id;
      if (!userId) return res.status(401).json({ error: "Non authentifié" });

      const result = await db.select({
        agenceId: userAgences.agenceId,
        agenceNom: agences.nom,
        agenceCode: agences.codeAgence,
        typeAgence: agences.typeAgence,
        isPrimary: userAgences.isPrimary,
        role: userAgences.role,
      })
      .from(userAgences)
      .innerJoin(agences, eq(userAgences.agenceId, agences.id))
      .where(and(
        eq(userAgences.userId, userId),
        eq(userAgences.actif, true),
      ))
      .orderBy(desc(userAgences.isPrimary), asc(agences.nom));

      const currentAgenceId = req.session.user?.agenceId || null;

      res.json({
        agencies: result,
        currentAgenceId,
        isMultiAgency: result.length > 1,
      });
    } catch (error) {
      logger.error({ err: error }, 'Get my agencies error');
      res.status(500).json({ error: "Erreur lors de la récupération des agences" });
    }
  });

  // ─── Multi-agency: switch active agency in session ────────────────────────
  app.post("/api/auth/switch-agency", requireAuth, async (req, res) => {
    try {
      const userId = req.session?.user?.id;
      if (!userId) return res.status(401).json({ error: "Non authentifié" });

      const { agenceId } = req.body;
      if (!agenceId) return res.status(400).json({ error: "agenceId requis" });

      // Verify user has access to this agency
      const [userAgence] = await db.select({
        agenceId: userAgences.agenceId,
        agenceNom: agences.nom,
      })
      .from(userAgences)
      .innerJoin(agences, eq(userAgences.agenceId, agences.id))
      .where(and(
        eq(userAgences.userId, userId),
        eq(userAgences.agenceId, agenceId),
        eq(userAgences.actif, true),
      ))
      .limit(1);

      if (!userAgence) {
        return res.status(403).json({ error: "Accès non autorisé à cette agence" });
      }

      // Update session
      req.session.user!.agenceId = userAgence.agenceId;
      req.session.user!.agence = userAgence.agenceNom;

      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => err ? reject(err) : resolve());
      });

      res.json({
        message: "Agence changée avec succès",
        agenceId: userAgence.agenceId,
        agenceNom: userAgence.agenceNom,
      });
    } catch (error) {
      logger.error({ err: error }, 'Switch agency error');
      res.status(500).json({ error: "Erreur lors du changement d'agence" });
    }
  });
}
