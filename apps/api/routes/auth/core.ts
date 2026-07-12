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

export function registerAuthCoreRoutes(app: Express) {
  app.post("/api/auth/login", async (req, res) => {
    const loginStartTime = Date.now();
    const { username } = req.body;

    logger.info({ username, step: 'start' }, '[Login] Request received');

    try {
      const { password, deviceFingerprint, deviceFingerprintPartial, rememberMe } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      // Étape 1 : Vérification du verrouillage avec délai
      logger.debug({ username, step: 'lockout_check' }, '[Login] Checking lockout status');
      const lockoutInfo = await withTimeout(
        getLoginLockoutInfo(username),
        DB_OPERATION_TIMEOUT_MS,
        'getLoginLockoutInfo'
      );

      if (lockoutInfo.locked) {
        await logLoginAttempt(username, req, false, "account_locked");
        logger.warn({ username, step: 'locked' }, '[Login] Account locked');
        return res.status(403).json({
          message: "Compte verrouillé suite à trop de tentatives échouées.",
          locked: true,
          retryAfterSeconds: lockoutInfo.retryAfterSeconds,
          lockedUntil: lockoutInfo.lockedUntil,
        });
      }

      // Étape 2 : Authentification de l'utilisateur avec délai
      logger.debug({ username, step: 'authenticate' }, '[Login] Authenticating user');
      const user = await withTimeout(
        loginUser(username, password),
        DB_OPERATION_TIMEOUT_MS,
        'loginUser'
      );

      if (!user) {
        await logLoginAttempt(username, req, false, "invalid_credentials");
        const updatedInfo = await getLoginLockoutInfo(username);
        logger.info({ username, step: 'invalid_credentials' }, '[Login] Invalid credentials');
        return res.status(401).json({
          message: "Identifiant ou mot de passe incorrect",
          remainingAttempts: updatedInfo.remainingAttempts,
          ...(updatedInfo.locked ? {
            locked: true,
            retryAfterSeconds: updatedInfo.retryAfterSeconds,
            lockedUntil: updatedInfo.lockedUntil,
          } : {}),
        });
      }

      if (user.statut !== StatutUser.ACTIVE) {
        await logLoginAttempt(username, req, false, "account_disabled");
        logger.warn({ username, step: 'account_disabled' }, '[Login] Account disabled');
        return res.status(403).json({ message: "Compte désactivé. Contactez un administrateur." });
      }

      // Étape 3 : Utilisateur authentifié avec succès
      logger.debug({ username, userId: user.id, step: 'authenticated' }, '[Login] User authenticated');
      await clearLoginAttemptsOnSuccess(username);
      await logLoginAttempt(username, req, true);

      // Étape 4 : Résolution de l'agence principale avec délai
      logger.debug({ username, step: 'resolve_agence' }, '[Login] Resolving primary agence');
      const primaryAgence = await withTimeout(
        resolvePrimaryAgence(user.id),
        DB_OPERATION_TIMEOUT_MS,
        'resolvePrimaryAgence'
      );

      // Notification aux administrateurs
      // Notification aux administrateurs
      try {
        const { getWsInstance } = await import("../../ws-server");
        const wsInstance = getWsInstance();
        if (wsInstance) {
           wsInstance.broadcast({
              type: "NOTIFICATION",
              payload: {
                 message: `Connexion: ${username}`,
                 targetRole: SystemRole.ADMIN
              }
           });
           wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
           
           // Activité en temps réel
           wsInstance.broadcast({
             type: "LIVE_ACTIVITY",
             payload: {
               action: `Connexion: ${user.prenom || ''} ${user.nom}`.trim(),
               user: primaryAgence?.agenceNom || 'Siège',
               type: 'login',
               timestamp: new Date().toISOString()
             }
           });
        }
      } catch (e) {
        logger.error({ err: e }, 'Failed to send WS notification');
      }
      
      // Étape 5 : Récupération du rôle effectif avec délai
      logger.debug({ username, step: 'get_role' }, '[Login] Getting effective role');
      const effectiveRole = await withTimeout(
        getEffectiveRole(user.id, primaryAgence?.agenceId),
        DB_OPERATION_TIMEOUT_MS,
        'getEffectiveRole'
      );

      // Étape 6 : Régénérer la session pour éviter les attaques de fixation
      logger.debug({ username, step: 'regenerate_session' }, '[Login] Regenerating session');
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) {
            logger.error({ err }, 'Session regeneration failed during login');
            reject(err);
          } else {
            resolve();
          }
        });
      });

      req.session.userId = user.id;
      req.session.user = {
          id: user.id,
          username: user.username || user.nom,
          nom: user.nom,
          prenom: user.prenom,
          role: effectiveRole,
          agence: primaryAgence?.agenceNom || null,
          agenceId: primaryAgence?.agenceId,
          email: user.email || undefined,
          telephone: user.telephone || undefined,
          mustChangePassword: user.mustChangePassword || false
      };

      // Sauvegarde de la session avec délai
      logger.debug({ username, step: 'save_session' }, '[Login] Saving session');
      try {
        await withTimeout(
          new Promise<void>((resolve, reject) => {
            req.session.save((err) => {
              if (err) {
                logger.error({ err }, 'Session save error');
                reject(err);
              } else {
                resolve();
              }
            });
          }),
          DB_OPERATION_TIMEOUT_MS,
          'sessionSave'
        );
      } catch (sessionErr) {
        logger.warn({ err: sessionErr }, '[Login] Session save failed, but continuing login');
      }

      // Appliquer la limite de sessions (max 3 par utilisateur)
      // Si la limite est atteinte, les plus anciennes sessions seront terminées
      const limitResult = await enforceSessionLimit(user.id);
      if (limitResult.sessionsTerminated > 0) {
        logger.info({
          userId: user.id,
          terminated: limitResult.sessionsTerminated,
          devices: limitResult.terminatedSessions.map(s => `${s.browser}/${s.deviceType}`).join(', '),
        }, 'Session limit enforced - old sessions terminated');
      }

      // Création d'un enregistrement de suivi de session aligné avec le délai d'expiration absolu (12h)
      // Inclure l'empreinte de l'appareil pour détecter le vol de cookies
      const expiresAt = new Date(Date.now() + SESSION_CONFIG.ABSOLUTE_TIMEOUT_MS);
      await createSessionRecord(
        req.sessionID,
        user.id,
        req,
        expiresAt,
        deviceFingerprint,
        deviceFingerprintPartial
      );

      // Enregistrement du succès de connexion dans l'audit
      await logAudit(
        req,
        "LOGIN",
        "auth",
        user.id,
        { ip: req.ip, userAgent: req.headers['user-agent'] },
        "success",
        "low"
      );

      // Étape 7 : Charger les permissions avec délai (étape critique pouvant bloquer)
      logger.debug({ username, step: 'load_permissions' }, '[Login] Loading permissions');
      const permissionsData = await withTimeout(
        getPermissionsForUser(user.id, effectiveRole),
        DB_OPERATION_TIMEOUT_MS,
        'getPermissionsForUser'
      );

      // Gestion de "Se souvenir de moi" - création du refresh token pour les sessions persistantes
      let rememberMeInfo: { expiresAt: Date } | null = null;
      if (rememberMe) {
        const refreshTokenResult = await refreshTokenService.create(user.id, req);

        // Définir le refresh token comme cookie HTTP-only
        res.cookie(
          REFRESH_TOKEN_COOKIE_NAME,
          refreshTokenResult.token,
          refreshTokenService.getCookieOptions(refreshTokenResult.expiresAt)
        );

        rememberMeInfo = { expiresAt: refreshTokenResult.expiresAt };
        logger.info({ userId: user.id }, 'Created remember-me refresh token');
      }

      // Étape 8 : Résolution des contextes utilisateur (client/employé)
      const contexts = await resolveUserContexts(user.id, effectiveRole);

      // Étape 9 : Succès - envoi de la réponse
      const totalDuration = Date.now() - loginStartTime;
      logger.info({
        username,
        userId: user.id,
        role: effectiveRole,
        agence: primaryAgence?.agenceNom,
        contexts: contexts.availableContexts,
        durationMs: totalDuration,
        step: 'complete'
      }, `[Login] Success in ${totalDuration}ms`);

      res.json({
        user: req.session.user,
        message: "Login successful",
        mustChangePassword: user.mustChangePassword || false,
        permissions: permissionsData,
        rememberMe: rememberMeInfo,
        availableContexts: contexts.availableContexts,
        defaultContext: contexts.defaultContext,
      });
    } catch (error) {
      const totalDuration = Date.now() - loginStartTime;
      const isTimeout = error instanceof Error && error.message.includes('Timeout');

      logger.error({
        username,
        durationMs: totalDuration,
        isTimeout,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      }, `[Login] Failed after ${totalDuration}ms`);

      if (isTimeout) {
        return res.status(504).json({
          message: "Le serveur met trop de temps à répondre. Veuillez réessayer.",
          error: "TIMEOUT"
        });
      }

      res.status(500).json({ message: "Erreur interne lors de la connexion" });
    }
  });

  // ============================================
  // INFOS ET EXTENSION DE SESSION
  // ============================================

  /**
   * GET /api/auth/session-info
   * Retourne les infos d'expiration de session pour que le client affiche des alertes
   */
  app.get("/api/auth/session-info", requireAuth, async (req, res) => {
    try {
      const sessionId = req.sessionID;
      const [session] = await db.select({
        expiresAt: activeSessions.expiresAt,
        lastActivity: activeSessions.lastActivity,
        loginAt: activeSessions.loginAt,
      })
      .from(activeSessions)
      .where(eq(activeSessions.sessionId, sessionId));

      if (!session) {
        return res.status(404).json({ error: "Session non trouvée" });
      }

      // Calcul du temps restant (basé sur le cookie, 2 heures glissantes pour la microfinance)
      const cookieMaxAge = SESSION_CONFIG.INACTIVITY_TIMEOUT_MS;
      const lastActivity = new Date(session.lastActivity).getTime();
      const expiresAt = lastActivity + cookieMaxAge;
      const now = Date.now();
      const remainingMs = Math.max(0, expiresAt - now);

      res.json({
        expiresAt: new Date(expiresAt).toISOString(),
        remainingMs,
        remainingMinutes: Math.floor(remainingMs / 60000),
        lastActivity: session.lastActivity,
        loginAt: session.loginAt,
        warningThresholdMs: SESSION_CONFIG.WARNING_BEFORE_EXPIRY_MS,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error getting session info');
      res.status(500).json({ error: "Erreur lors de la récupération des infos de session" });
    }
  });

  /**
   * POST /api/auth/extend-session
   * Prolonge la session en la touchant (met à jour lastActivity)
   */
  app.post("/api/auth/extend-session", requireAuth, async (req, res) => {
    try {
      const sessionId = req.sessionID;
      const userId = req.session.user!.id;

      // Mise à jour de l'activité de session (ceci prolonge la session glissante)
      await db.update(activeSessions)
        .set({ lastActivity: new Date() })
        .where(eq(activeSessions.sessionId, sessionId));

      // Toucher la session express pour rafraîchir le cookie
      req.session.touch();

      const cookieMaxAge = SESSION_CONFIG.INACTIVITY_TIMEOUT_MS;
      const newExpiresAt = Date.now() + cookieMaxAge;
      const remainingMinutes = Math.floor(cookieMaxAge / 60000);

      logger.info({ userId, sessionId: sessionId.slice(0, 8) }, 'Session extended by user');

      res.json({
        success: true,
        message: `Session prolongée de ${remainingMinutes} minutes`,
        expiresAt: new Date(newExpiresAt).toISOString(),
        remainingMs: cookieMaxAge,
        remainingMinutes,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error extending session');
      res.status(500).json({ error: "Erreur lors de la prolongation de la session" });
    }
  });

  // ============================================
  // REFRESH TOKEN (Se souvenir de moi)
  // ============================================

  /**
   * POST /api/auth/refresh
   * Utilise un refresh token pour créer une nouvelle session (fonctionnalité Se souvenir de moi)
   * Le refresh token est envoyé sous forme de cookie HTTP-only
   */
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
  app.post("/api/auth/logout", async (req, res) => {
    const sessionId = req.sessionID;
    const userId = req.session.user?.id;

    if (req.session.user) {
      await logAudit(
        req,
        "LOGOUT",
        "auth",
        req.session.user.id,
        undefined,
        "success",
        "low"
      );
    }

    // Forcer la fermeture de toute session de caisse ouverte pour cet utilisateur
    if (userId) {
      try {
        await caisseAdminService.forceCloseOnLogout(userId);
      } catch (err) {
        logger.error({ err, userId }, 'Error force-closing caisse on logout');
      }
    }

    // Supprimer de la table active_sessions + Redis + ZSET
    if (sessionId) {
      await deleteSessionRecord(sessionId, userId);
    }

    // Révoquer tout refresh token (se souvenir de moi)
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
    if (refreshToken) {
      await refreshTokenService.revoke(refreshToken, 'user_logout');
    }
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/api/auth' });

    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ message: "Logout successful" });
    });
  });

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
