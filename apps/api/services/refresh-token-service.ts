/**
 * Service de gestion des Refresh Tokens
 *
 * Implémente la fonctionnalité "Remember Me" avec:
 * - Tokens de rafraîchissement à longue durée (30 jours)
 * - Rotation des tokens à chaque utilisation (sécurité)
 * - Détection de réutilisation de tokens (vol potentiel)
 * - Révocation par famille de tokens
 *
 * Sécurité:
 * - Les tokens sont hashés en SHA-256 (jamais stockés en clair)
 * - Chaque utilisation génère un nouveau token (rotation)
 * - Si un ancien token est réutilisé, toute la famille est révoquée
 */

import { db } from '../db';
import { refreshTokens, users } from '@shared/schema';
import { eq, and, lt, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { createLogger } from '../lib/logger';

const logger = createLogger('RefreshTokenService');

// Configuration
const CONFIG = {
  // Durée de validité du refresh token (30 jours)
  TOKEN_EXPIRY_DAYS: 30,

  // Taille du token en bytes (256 bits = 32 bytes)
  TOKEN_SIZE_BYTES: 32,

  // Maximum de refresh tokens actifs par utilisateur
  MAX_TOKENS_PER_USER: 5,

  // Nom du cookie pour le refresh token
  COOKIE_NAME: 'microflex_refresh',
};

/**
 * Génère un token aléatoire sécurisé
 */
function generateToken(): string {
  return randomBytes(CONFIG.TOKEN_SIZE_BYTES).toString('base64url');
}

/**
 * Hash un token avec SHA-256
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Génère un UUID v4 pour la famille de tokens
 */
function generateFamilyId(): string {
  return crypto.randomUUID();
}

export interface CreateRefreshTokenResult {
  token: string; // Le token en clair (à envoyer au client une seule fois)
  expiresAt: Date;
  familyId: string;
}

export interface RefreshResult {
  success: boolean;
  newToken?: string;
  newExpiresAt?: Date;
  userId?: string;
  error?: string;
  shouldRevokeFamily?: boolean;
}

/**
 * Crée un nouveau refresh token pour un utilisateur
 */
export async function createRefreshToken(
  userId: string,
  req: { ip?: string; headers: { 'user-agent'?: string }; body?: { deviceFingerprint?: string } }
): Promise<CreateRefreshTokenResult> {
  // Générer le token et son hash
  const token = generateToken();
  const tokenHash = hashToken(token);
  const familyId = generateFamilyId();

  // Date d'expiration
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CONFIG.TOKEN_EXPIRY_DAYS);

  // Nettoyer les anciens tokens si la limite est atteinte
  await cleanupOldTokens(userId);

  // Insérer le nouveau token
  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    deviceFingerprint: req.body?.deviceFingerprint || null,
    ipAddress: req.ip || null,
    userAgent: req.headers['user-agent'] || null,
    familyId,
    generation: 1,
    expiresAt,
  });

  logger.info({ userId, familyId }, 'Created new refresh token family');

  return { token, expiresAt, familyId };
}

/**
 * Utilise un refresh token pour générer un nouveau token (rotation)
 *
 * Implémente la rotation des tokens:
 * - Le token actuel est invalidé
 * - Un nouveau token est créé dans la même famille
 * - Si le token a déjà été utilisé, toute la famille est révoquée (vol détecté)
 */
export async function useRefreshToken(token: string): Promise<RefreshResult> {
  const tokenHash = hashToken(token);

  try {
    // Trouver le token dans la base
    const [existingToken] = await db.select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));

    // Token non trouvé
    if (!existingToken) {
      logger.warn({ tokenHashPrefix: tokenHash.substring(0, 8) }, 'Refresh token not found');
      return { success: false, error: 'token_not_found' };
    }

    // Token révoqué - possible vol si quelqu'un essaie d'utiliser un ancien token
    if (existingToken.revoked) {
      logger.warn({
        userId: existingToken.userId,
        familyId: existingToken.familyId,
        reason: existingToken.revokeReason,
      }, 'Attempted use of revoked refresh token - possible theft');

      // Révoquer toute la famille par précaution
      await revokeFamilyTokens(existingToken.familyId, 'reuse_of_revoked_token');

      return {
        success: false,
        error: 'token_revoked',
        shouldRevokeFamily: true,
      };
    }

    // Token expiré
    if (new Date(existingToken.expiresAt) < new Date()) {
      logger.info({ userId: existingToken.userId }, 'Refresh token expired');
      return { success: false, error: 'token_expired' };
    }

    // Vérifier que l'utilisateur peut toujours se connecter
    const [user] = await db.select({
      canLogin: users.canLogin,
      statut: users.statut,
    })
    .from(users)
    .where(eq(users.id, existingToken.userId));

    if (!user || !user.canLogin || user.statut !== 'ACTIVE') {
      logger.info({ userId: existingToken.userId }, 'User cannot login - revoking token');
      await revokeFamilyTokens(existingToken.familyId, 'user_disabled');
      return { success: false, error: 'user_disabled' };
    }

    // Rotation: Révoquer l'ancien token et créer un nouveau
    await db.update(refreshTokens)
      .set({
        revoked: true,
        revokedAt: new Date(),
        revokeReason: 'rotated',
        lastUsedAt: new Date(),
      })
      .where(eq(refreshTokens.id, existingToken.id));

    // Créer le nouveau token dans la même famille
    const newToken = generateToken();
    const newTokenHash = hashToken(newToken);
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + CONFIG.TOKEN_EXPIRY_DAYS);

    await db.insert(refreshTokens).values({
      userId: existingToken.userId,
      tokenHash: newTokenHash,
      deviceFingerprint: existingToken.deviceFingerprint,
      ipAddress: existingToken.ipAddress,
      userAgent: existingToken.userAgent,
      familyId: existingToken.familyId,
      generation: existingToken.generation + 1,
      expiresAt: newExpiresAt,
    });

    logger.info({
      userId: existingToken.userId,
      familyId: existingToken.familyId,
      newGeneration: existingToken.generation + 1,
    }, 'Rotated refresh token');

    return {
      success: true,
      newToken,
      newExpiresAt,
      userId: existingToken.userId,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error using refresh token');
    return { success: false, error: 'internal_error' };
  }
}

/**
 * Révoque tous les tokens d'une famille
 */
export async function revokeFamilyTokens(familyId: string, reason: string): Promise<number> {
  try {
    const result = await db.update(refreshTokens)
      .set({
        revoked: true,
        revokedAt: new Date(),
        revokeReason: reason,
      })
      .where(and(
        eq(refreshTokens.familyId, familyId),
        eq(refreshTokens.revoked, false)
      ))
      .returning();

    logger.info({ familyId, count: result.length, reason }, 'Revoked token family');
    return result.length;
  } catch (error) {
    logger.error({ err: error, familyId }, 'Error revoking token family');
    return 0;
  }
}

/**
 * Révoque tous les refresh tokens d'un utilisateur
 */
export async function revokeUserTokens(userId: string, reason: string): Promise<number> {
  try {
    const result = await db.update(refreshTokens)
      .set({
        revoked: true,
        revokedAt: new Date(),
        revokeReason: reason,
      })
      .where(and(
        eq(refreshTokens.userId, userId),
        eq(refreshTokens.revoked, false)
      ))
      .returning();

    logger.info({ userId, count: result.length, reason }, 'Revoked all user refresh tokens');
    return result.length;
  } catch (error) {
    logger.error({ err: error, userId }, 'Error revoking user tokens');
    return 0;
  }
}

/**
 * Révoque un refresh token spécifique (par son hash)
 */
export async function revokeRefreshToken(token: string, reason: string): Promise<boolean> {
  const tokenHash = hashToken(token);

  try {
    const result = await db.update(refreshTokens)
      .set({
        revoked: true,
        revokedAt: new Date(),
        revokeReason: reason,
      })
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .returning();

    return result.length > 0;
  } catch (error) {
    logger.error({ err: error }, 'Error revoking refresh token');
    return false;
  }
}

/**
 * Nettoie les anciens tokens d'un utilisateur si la limite est dépassée
 */
async function cleanupOldTokens(userId: string): Promise<void> {
  try {
    // Compter les tokens actifs
    const activeTokens = await db.select({ id: refreshTokens.id, createdAt: refreshTokens.createdAt })
      .from(refreshTokens)
      .where(and(
        eq(refreshTokens.userId, userId),
        eq(refreshTokens.revoked, false)
      ))
      .orderBy(refreshTokens.createdAt);

    // Si on dépasse la limite, révoquer les plus anciens
    if (activeTokens.length >= CONFIG.MAX_TOKENS_PER_USER) {
      const tokensToRevoke = activeTokens.slice(0, activeTokens.length - CONFIG.MAX_TOKENS_PER_USER + 1);

      for (const token of tokensToRevoke) {
        await db.update(refreshTokens)
          .set({
            revoked: true,
            revokedAt: new Date(),
            revokeReason: 'max_tokens_limit',
          })
          .where(eq(refreshTokens.id, token.id));
      }

      logger.info({ userId, revokedCount: tokensToRevoke.length }, 'Cleaned up old refresh tokens');
    }
  } catch (error) {
    logger.error({ err: error, userId }, 'Error cleaning up old tokens');
  }
}

/**
 * Nettoie tous les tokens expirés (à appeler périodiquement)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  try {
    const result = await db.delete(refreshTokens)
      .where(lt(refreshTokens.expiresAt, new Date()))
      .returning();

    if (result.length > 0) {
      logger.info({ count: result.length }, 'Cleaned up expired refresh tokens');
    }
    return result.length;
  } catch (error) {
    logger.error({ err: error }, 'Error cleaning up expired tokens');
    return 0;
  }
}

/**
 * Obtient les options du cookie pour le refresh token
 */
export function getRefreshTokenCookieOptions(expiresAt: Date): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  expires: Date;
  path: string;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires: expiresAt,
    path: '/api/auth', // Cookie uniquement accessible aux routes d'auth
  };
}

export const REFRESH_TOKEN_COOKIE_NAME = CONFIG.COOKIE_NAME;

export default {
  create: createRefreshToken,
  use: useRefreshToken,
  revokeFamily: revokeFamilyTokens,
  revokeUser: revokeUserTokens,
  revoke: revokeRefreshToken,
  cleanup: cleanupExpiredTokens,
  cookieName: CONFIG.COOKIE_NAME,
  getCookieOptions: getRefreshTokenCookieOptions,
};
