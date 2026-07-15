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
}
