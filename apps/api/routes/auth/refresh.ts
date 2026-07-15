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
 * Routes de rafraîchissement de session (refresh token, remember me).
 * Extrait de core.ts pour respecter la limite de 400 lignes.
 */
export function registerAuthRefreshRoutes(app: Express) {
  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

      if (!refreshToken) {
        return res.status(401).json({
          error: "no_refresh_token",
          message: "Aucun token de rafraîchissement trouvé",
        });
      }

      // Utiliser le refresh token (ceci effectue une rotation)
      const result = await refreshTokenService.use(refreshToken);

      if (!result.success) {
        // Effacer le cookie invalide
        res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/api/auth' });

        return res.status(401).json({
          error: result.error,
          message: result.error === 'token_expired'
            ? "Token expiré - veuillez vous reconnecter"
            : result.error === 'token_revoked'
            ? "Session révoquée pour raison de sécurité"
            : "Token invalide",
        });
      }

      // Récupération des données utilisateur pour créer une nouvelle session
      const [user] = await db.select()
        .from(users)
        .where(eq(users.id, result.userId!));

      if (!user) {
        res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/api/auth' });
        return res.status(401).json({ error: "user_not_found" });
      }

      // Récupération du rôle effectif de l'utilisateur
      const [primaryRole] = await db.select({ role: userRoles.role })
        .from(userRoles)
        .where(and(
          eq(userRoles.userId, user.id),
          eq(userRoles.isPrimary, true)
        ));

      const effectiveRole = (primaryRole?.role as SystemRole) || SystemRole.CLIENT;

      // Récupération de l'agence principale de l'utilisateur
      const primaryAgence = await resolvePrimaryAgence(user.id);

      // Création d'une nouvelle session express
      req.session.regenerate(async (err) => {
        if (err) {
          logger.error({ err }, 'Session regeneration failed during refresh');
          res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/api/auth' });
          return res.status(500).json({ error: "session_error" });
        }

        // Définition des données de session
        req.session.userId = user.id;
        req.session.user = {
          id: user.id,
          username: user.username || '',
          email: user.email || '',
          nom: user.nom,
          prenom: user.prenom,
          role: effectiveRole,
          statut: user.statut,
          agence: primaryAgence?.agenceNom || null,
          agenceId: primaryAgence?.agenceId,
          photoProfile: user.photoProfile,
          mustChangePassword: user.mustChangePassword || false,
        };

        // Création d'un enregistrement de suivi de session aligné avec le délai d'expiration absolu
        const expiresAt = new Date(Date.now() + SESSION_CONFIG.ABSOLUTE_TIMEOUT_MS);
        const { deviceFingerprint, deviceFingerprintPartial } = req.body || {};
        await createSessionRecord(
          req.sessionID,
          user.id,
          req,
          expiresAt,
          deviceFingerprint,
          deviceFingerprintPartial
        );

        // Définition du nouveau cookie de refresh token
        res.cookie(
          REFRESH_TOKEN_COOKIE_NAME,
          result.newToken!,
          refreshTokenService.getCookieOptions(result.newExpiresAt!)
        );

        // Chargement des permissions
        const permissionsData = await getPermissionsForUser(user.id, effectiveRole);

        // Résolution des contextes
        const contexts = await resolveUserContexts(user.id, effectiveRole);

        logger.info({ userId: user.id }, 'Session refreshed via remember-me token');

        res.json({
          user: req.session.user,
          message: "Session restaurée",
          permissions: permissionsData,
          rememberMe: { expiresAt: result.newExpiresAt },
          availableContexts: contexts.availableContexts,
          defaultContext: contexts.defaultContext,
        });
      });
    } catch (error) {
      logger.error({ err: error }, 'Error refreshing session');
      res.status(500).json({ error: "Erreur lors du rafraîchissement de la session" });
    }
  });

  /**
   * POST /api/auth/revoke-remember-me
   * Révoque le token remember-me actuel (déconnexion de la session persistante)
   */
  app.post("/api/auth/revoke-remember-me", async (req, res) => {
    try {
      const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

      if (refreshToken) {
        await refreshTokenService.revoke(refreshToken, 'user_logout');
      }

      res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/api/auth' });

      res.json({ success: true, message: "Remember-me révoqué" });
    } catch (error) {
      logger.error({ err: error }, 'Error revoking remember-me');
      res.status(500).json({ error: "Erreur lors de la révocation" });
    }
  });

  // ============================================
  // MOT DE PASSE OUBLIÉ (Réinitialisation en libre-service)
  // ============================================

  /**
   * POST /api/auth/forgot-password
   * Demande un OTP de réinitialisation de mot de passe à envoyer par SMS ou email
   * Endpoint public (sans authentification requise)
   */
}
