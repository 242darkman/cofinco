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
 * Routes des rôles et agences de l’utilisateur (my-roles, my-agencies, switch).
 * Extrait de profile.ts pour respecter la limite de 400 lignes.
 */
export function registerAuthAgencyRoutes(app: Express) {
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
