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
 * Routes de réinitialisation de mot de passe (OTP).
 * Extrait de core.ts pour respecter la limite de 400 lignes.
 */
export function registerAuthPasswordResetRoutes(app: Express) {
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { identifier } = req.body;

      if (!identifier) {
        return res.status(400).json({
          error: "identifier_required",
          message: "Veuillez fournir votre email ou numéro de téléphone",
        });
      }

      // Recherche de l'utilisateur par email ou téléphone
      const [user] = await db.select({
        id: users.id,
        email: users.email,
        telephone: users.telephone,
        nom: users.nom,
        prenom: users.prenom,
        statut: users.statut,
        canLogin: users.canLogin,
      })
      .from(users)
      .where(
        identifier.includes('@')
          ? eq(users.email, identifier)
          : eq(users.telephone, identifier)
      );

      // Toujours retourner un succès pour empêcher l'énumération des utilisateurs
      // Mais n'envoyer l'OTP que si l'utilisateur existe et est actif
      if (!user || user.statut !== StatutUser.ACTIVE || !user.canLogin) {
        logger.info({ identifier: identifier.slice(0, 5) + '***' }, 'Password reset requested for non-existent/inactive user');
        // Retarder la réponse pour éviter les attaques temporelles
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
        return res.json({
          success: true,
          message: "Si un compte existe avec ces informations, un code de vérification sera envoyé.",
        });
      }

      // Déterminer la destination (préférence email, puis téléphone)
      const destination = user.email || user.telephone;
      if (!destination) {
        logger.warn({ userId: user.id }, 'User has no email or phone for password reset');
        return res.json({
          success: true,
          message: "Si un compte existe avec ces informations, un code de vérification sera envoyé.",
        });
      }

      const channel = user.email ? 'EMAIL' : 'SMS';

      // Demander un OTP
      const otpResult = await requestOtp({
        userId: user.id,
        destination,
        channel,
        purpose: 'PASSWORD_RESET',
        templatePayload: {
          userName: `${user.prenom || ''} ${user.nom}`.trim(),
        },
        ipAddress: req.ip,
      });

      logger.info({
        userId: user.id,
        channel,
        destinationMasked: destination.slice(0, 3) + '***',
      }, 'Password reset OTP sent');

      res.json({
        success: true,
        message: "Si un compte existe avec ces informations, un code de vérification sera envoyé.",
        // Exposer ces données uniquement en développement
        ...(process.env.NODE_ENV !== 'production' ? {
          debug: {
            otpId: otpResult.otpId,
            code: otpResult.debugCode,
            expiresAt: otpResult.expiresAt,
          }
        } : {}),
      });
    } catch (error) {
      if (error instanceof OtpRateLimitError) {
        return res.status(429).json({
          error: "rate_limited",
          message: error.message,
        });
      }
      logger.error({ err: error }, 'Forgot password error');
      res.status(500).json({
        error: "server_error",
        message: "Une erreur est survenue. Veuillez réessayer plus tard.",
      });
    }
  });

  /**
   * POST /api/auth/reset-password
   * Réinitialise le mot de passe via la vérification OTP
   * Endpoint public (sans authentification requise)
   */
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { identifier, code, newPassword } = req.body;

      if (!identifier || !code || !newPassword) {
        return res.status(400).json({
          error: "missing_fields",
          message: "Tous les champs sont requis (identifiant, code, nouveau mot de passe)",
        });
      }

      // Valider la complexité du mot de passe
      const requirements = await getPasswordRequirements();
      const validation = validatePassword(newPassword, requirements);
      if (!validation.valid) {
        return res.status(400).json({
          error: "password_weak",
          message: "Le mot de passe ne respecte pas les exigences de sécurité",
          details: validation.errors,
        });
      }

      // Trouver l'utilisateur
      const [user] = await db.select({
        id: users.id,
        email: users.email,
        telephone: users.telephone,
        nom: users.nom,
        prenom: users.prenom,
        username: users.username,
        statut: users.statut,
      })
      .from(users)
      .where(
        identifier.includes('@')
          ? eq(users.email, identifier)
          : eq(users.telephone, identifier)
      );

      if (!user) {
        return res.status(400).json({
          error: "invalid_code",
          message: "Code invalide ou expiré",
        });
      }

      // Déterminer la destination pour la vérification OTP
      const destination = user.email || user.telephone;
      if (!destination) {
        return res.status(400).json({
          error: "invalid_code",
          message: "Code invalide ou expiré",
        });
      }

      // Vérifier l'OTP
      const otpResult = await verifyOtp({
        destination,
        purpose: 'PASSWORD_RESET',
        code,
      });

      if (!otpResult.valid) {
        return res.status(400).json({
          error: "invalid_code",
          message: otpResult.error || "Code invalide ou expiré",
          attemptsRemaining: otpResult.attemptsRemaining,
        });
      }

      // OTP vérifié - mise à jour du mot de passe
      const hashedPassword = await hashPassword(newPassword);
      await db.update(users)
        .set({
          password: hashedPassword,
          mustChangePassword: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // SÉCURITÉ : Invalider TOUTES les sessions pour cet utilisateur
      await markUserSessionsInactive(user.id);

      // Révoquer TOUS les refresh tokens
      await refreshTokenService.revokeUser(user.id, 'password_reset');

      // Journal d'audit
      await logAudit(
        req,
        "PASSWORD_RESET_SELF",
        "auth",
        user.id,
        { method: 'otp', ip: req.ip },
        "success",
        "critical"
      );

      // Événement de domaine pour la notification
      dispatchDomainEvent({
        type: "USER_PASSWORD_CHANGED",
        data: {
          userId: user.id,
          userName: [user.nom, user.prenom].filter(Boolean).join(" ") || user.username || "",
          email: user.email || undefined,
          resetMethod: 'self_service',
        },
        timestamp: new Date(),
      });

      logger.info({ userId: user.id }, 'Password reset completed via self-service');

      res.json({
        success: true,
        message: "Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.",
      });
    } catch (error) {
      logger.error({ err: error }, 'Reset password error');
      res.status(500).json({
        error: "server_error",
        message: "Une erreur est survenue. Veuillez réessayer plus tard.",
      });
    }
  });

  /**
   * GET /api/auth/my-sessions
   * Retourne toutes les sessions actives pour l'utilisateur actuel
   */
}
