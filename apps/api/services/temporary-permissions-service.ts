/**
 * Temporary Permissions Service
 * =============================
 *
 * Gère les permissions temporaires avec expiration automatique.
 *
 * Fonctionnalités:
 * - Accorder une permission temporaire à un utilisateur
 * - Révoquer manuellement une permission temporaire
 * - Expirer automatiquement les permissions (appelé par cron)
 * - Obtenir les permissions temporaires actives pour un utilisateur
 * - Envoyer des notifications avant expiration (1h, 24h)
 * - Webhooks externes pour intégrations tierces
 * - Historique complet des permissions temporaires
 */

import { db } from '../db';
import { temporaryPermissions, permissions, users } from '@shared/schema';
import { eq, and, lte, desc, sql, gt, gte, isNull, or } from 'drizzle-orm';
import { getWsInstance } from '../ws-server';
import { incrementRbacVersion } from './rbac-service';
import { enqueueNotification, sendInAppNotification } from './notifications/notification-service';
import { createLogger } from '../lib/logger';

const logger = createLogger('TempPermissions');

// Configuration des seuils de notification (en millisecondes)
export const EXPIRY_WARNING_THRESHOLDS = {
  ONE_HOUR: 60 * 60 * 1000,        // 1 heure avant
  TWENTY_FOUR_HOURS: 24 * 60 * 60 * 1000, // 24 heures avant
};

// Set pour tracker les notifications déjà envoyées (évite les duplications)
// Format: `${tempPermId}-${threshold}`
const sentNotifications = new Set<string>();

// Types
export interface GrantTempPermissionParams {
  userId: string;
  permissionId: string;
  grantedBy: string;
  expiresAt: Date;
  reason: string;
}

export interface TempPermissionResult {
  id: string;
  userId: string;
  permissionId: string;
  permissionCode: string;
  permissionName: string;
  grantedBy: string;
  granterName: string;
  grantedAt: Date;
  expiresAt: Date;
  reason: string;
  isActive: boolean;
  timeRemaining?: number; // milliseconds
}

export interface ExpiredPermissionInfo {
  id: string;
  userId: string;
  permissionCode: string;
  expiresAt: Date;
}

/**
 * Accorder une permission temporaire à un utilisateur
 */
export async function grantTemporaryPermission(
  params: GrantTempPermissionParams
): Promise<TempPermissionResult> {
  const { userId, permissionId, grantedBy, expiresAt, reason } = params;

  // Vérifier que la permission existe
  const [perm] = await db.select()
    .from(permissions)
    .where(eq(permissions.id, permissionId));

  if (!perm) {
    throw new Error(`Permission non trouvée: ${permissionId}`);
  }

  // Vérifier s'il existe déjà une permission temporaire active
  const [existing] = await db.select()
    .from(temporaryPermissions)
    .where(and(
      eq(temporaryPermissions.userId, userId),
      eq(temporaryPermissions.permissionId, permissionId),
      eq(temporaryPermissions.isActive, true)
    ));

  if (existing) {
    throw new Error('Une permission temporaire active existe déjà pour cette permission');
  }

  // Insérer la nouvelle permission temporaire
  const [created] = await db.insert(temporaryPermissions)
    .values({
      userId,
      permissionId,
      grantedBy,
      expiresAt,
      reason,
      isActive: true,
    })
    .returning();

  // Obtenir les infos du granter
  const [granter] = await db.select({ nom: users.nom, prenom: users.prenom })
    .from(users)
    .where(eq(users.id, grantedBy));

  // Incrémenter la version RBAC
  await incrementRbacVersion('temporary_permission', 'granted', { userId, permissionCode: perm.code });

  // Notifier l'utilisateur via WebSocket
  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.sendToUser(userId, {
      type: 'RBAC_UPDATE',
      payload: {
        entity: 'temporary_permission',
        action: 'granted',
        userId,
        permissionCode: perm.code,
        expiresAt: expiresAt.toISOString(),
      }
    });
  }

  return {
    id: created.id,
    userId: created.userId,
    permissionId: created.permissionId,
    permissionCode: perm.code,
    permissionName: perm.name,
    grantedBy: created.grantedBy,
    granterName: granter ? `${granter.prenom || ''} ${granter.nom}`.trim() : 'Inconnu',
    grantedAt: created.grantedAt,
    expiresAt: created.expiresAt,
    reason: created.reason,
    isActive: created.isActive,
    timeRemaining: created.expiresAt.getTime() - Date.now(),
  };
}

/**
 * Révoquer une permission temporaire
 */
export async function revokeTemporaryPermission(
  tempPermId: string,
  revokedBy: string,
  revokeReason?: string
): Promise<{ success: boolean }> {
  // Obtenir la permission avec son code
  const [existing] = await db.select({
    tp: temporaryPermissions,
    permCode: permissions.code,
  })
    .from(temporaryPermissions)
    .leftJoin(permissions, eq(temporaryPermissions.permissionId, permissions.id))
    .where(eq(temporaryPermissions.id, tempPermId));

  if (!existing || !existing.tp.isActive) {
    throw new Error('Permission temporaire non trouvée ou déjà révoquée');
  }

  // Marquer comme révoquée
  await db.update(temporaryPermissions)
    .set({
      isActive: false,
      revokedAt: new Date(),
      revokedBy,
      revokeReason,
    })
    .where(eq(temporaryPermissions.id, tempPermId));

  // Incrémenter la version RBAC
  await incrementRbacVersion('temporary_permission', 'revoked', {
    userId: existing.tp.userId,
    permissionCode: existing.permCode,
  });

  // Notifier l'utilisateur
  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.sendToUser(existing.tp.userId, {
      type: 'RBAC_UPDATE',
      payload: {
        entity: 'temporary_permission',
        action: 'revoked',
        userId: existing.tp.userId,
        permissionCode: existing.permCode,
      }
    });
  }

  return { success: true };
}

/**
 * Obtenir toutes les permissions temporaires actives pour un utilisateur
 */
export async function getUserTemporaryPermissions(userId: string): Promise<TempPermissionResult[]> {
  const results = await db.select({
    tp: temporaryPermissions,
    permCode: permissions.code,
    permName: permissions.name,
    granterNom: users.nom,
    granterPrenom: users.prenom,
  })
    .from(temporaryPermissions)
    .leftJoin(permissions, eq(temporaryPermissions.permissionId, permissions.id))
    .leftJoin(users, eq(temporaryPermissions.grantedBy, users.id))
    .where(and(
      eq(temporaryPermissions.userId, userId),
      eq(temporaryPermissions.isActive, true)
    ))
    .orderBy(desc(temporaryPermissions.expiresAt));

  const now = Date.now();

  return results.map(r => ({
    id: r.tp.id,
    userId: r.tp.userId,
    permissionId: r.tp.permissionId,
    permissionCode: r.permCode || '',
    permissionName: r.permName || '',
    grantedBy: r.tp.grantedBy,
    granterName: `${r.granterPrenom || ''} ${r.granterNom || ''}`.trim(),
    grantedAt: r.tp.grantedAt,
    expiresAt: r.tp.expiresAt,
    reason: r.tp.reason,
    isActive: r.tp.isActive,
    timeRemaining: r.tp.expiresAt.getTime() - now,
  }));
}

/**
 * Obtenir toutes les permissions temporaires (admin view)
 */
export async function getAllTemporaryPermissions(options?: {
  activeOnly?: boolean;
  limit?: number;
}): Promise<TempPermissionResult[]> {
  const { activeOnly = true, limit = 100 } = options || {};

  let query = db.select({
    tp: temporaryPermissions,
    permCode: permissions.code,
    permName: permissions.name,
    granterNom: users.nom,
    granterPrenom: users.prenom,
    userName: sql<string>`(SELECT nom || ' ' || COALESCE(prenom, '') FROM users WHERE id = ${temporaryPermissions.userId})`.as('user_name'),
  })
    .from(temporaryPermissions)
    .leftJoin(permissions, eq(temporaryPermissions.permissionId, permissions.id))
    .leftJoin(users, eq(temporaryPermissions.grantedBy, users.id))
    .orderBy(desc(temporaryPermissions.expiresAt))
    .limit(limit);

  if (activeOnly) {
    query = query.where(eq(temporaryPermissions.isActive, true)) as typeof query;
  }

  const results = await query;
  const now = Date.now();

  return results.map(r => ({
    id: r.tp.id,
    userId: r.tp.userId,
    permissionId: r.tp.permissionId,
    permissionCode: r.permCode || '',
    permissionName: r.permName || '',
    grantedBy: r.tp.grantedBy,
    granterName: `${r.granterPrenom || ''} ${r.granterNom || ''}`.trim(),
    grantedAt: r.tp.grantedAt,
    expiresAt: r.tp.expiresAt,
    reason: r.tp.reason,
    isActive: r.tp.isActive,
    timeRemaining: r.tp.expiresAt.getTime() - now,
  }));
}

/**
 * Expirer toutes les permissions temporaires dépassées
 * Appelé par le cron job
 */
export async function expireTemporaryPermissions(): Promise<ExpiredPermissionInfo[]> {
  const now = new Date();

  // Trouver toutes les permissions actives expirées
  const expiredPerms = await db.select({
    tp: temporaryPermissions,
    permCode: permissions.code,
  })
    .from(temporaryPermissions)
    .leftJoin(permissions, eq(temporaryPermissions.permissionId, permissions.id))
    .where(and(
      eq(temporaryPermissions.isActive, true),
      lte(temporaryPermissions.expiresAt, now)
    ));

  if (expiredPerms.length === 0) {
    return [];
  }

  // Désactiver toutes les permissions expirées
  await db.update(temporaryPermissions)
    .set({ isActive: false })
    .where(and(
      eq(temporaryPermissions.isActive, true),
      lte(temporaryPermissions.expiresAt, now)
    ));

  // Incrémenter la version RBAC une seule fois
  await incrementRbacVersion('temporary_permission', 'batch_expired', {
    count: expiredPerms.length,
  });

  // Notifier les utilisateurs affectés
  const wsInstance = getWsInstance();
  if (wsInstance) {
    for (const expired of expiredPerms) {
      wsInstance.sendToUser(expired.tp.userId, {
        type: 'RBAC_UPDATE',
        payload: {
          entity: 'temporary_permission',
          action: 'expired',
          userId: expired.tp.userId,
          permissionCode: expired.permCode,
        }
      });
    }
  }

  return expiredPerms.map(p => ({
    id: p.tp.id,
    userId: p.tp.userId,
    permissionCode: p.permCode || '',
    expiresAt: p.tp.expiresAt,
  }));
}

/**
 * Obtenir les codes de permissions temporaires actives pour un utilisateur
 * Utilisé par le constructeur d'ability
 */
export async function getActiveTemporaryPermissionCodes(userId: string): Promise<string[]> {
  const now = new Date();

  const perms = await db.select({ code: permissions.code })
    .from(temporaryPermissions)
    .leftJoin(permissions, eq(temporaryPermissions.permissionId, permissions.id))
    .where(and(
      eq(temporaryPermissions.userId, userId),
      eq(temporaryPermissions.isActive, true),
      gte(temporaryPermissions.expiresAt, now)
    ));

  return perms.map(p => p.code).filter(Boolean) as string[];
}

/**
 * Vérifier si un utilisateur a une permission temporaire spécifique
 */
export async function hasTemporaryPermission(
  userId: string,
  permissionCode: string
): Promise<boolean> {
  const codes = await getActiveTemporaryPermissionCodes(userId);
  return codes.includes(permissionCode);
}

// ============================================================================
// NOTIFICATIONS & WARNINGS
// ============================================================================

/**
 * Format du temps restant en texte lisible
 */
function formatTimeRemaining(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} jour(s)`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes} minute(s)`;
}

/**
 * Obtenir les permissions qui expirent bientôt (dans les seuils configurés)
 */
export async function getExpiringPermissions(thresholdMs: number): Promise<Array<{
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string;
  permissionId: string;
  permissionCode: string;
  permissionName: string;
  expiresAt: Date;
  timeRemaining: number;
}>> {
  const now = new Date();
  const threshold = new Date(now.getTime() + thresholdMs);

  const results = await db.select({
    id: temporaryPermissions.id,
    userId: temporaryPermissions.userId,
    permissionId: temporaryPermissions.permissionId,
    expiresAt: temporaryPermissions.expiresAt,
    permCode: permissions.code,
    permName: permissions.name,
    userEmail: users.email,
    userNom: users.nom,
    userPrenom: users.prenom,
  })
    .from(temporaryPermissions)
    .leftJoin(permissions, eq(temporaryPermissions.permissionId, permissions.id))
    .leftJoin(users, eq(temporaryPermissions.userId, users.id))
    .where(and(
      eq(temporaryPermissions.isActive, true),
      gt(temporaryPermissions.expiresAt, now),
      lte(temporaryPermissions.expiresAt, threshold)
    ));

  return results.map(r => ({
    id: r.id,
    userId: r.userId,
    userEmail: r.userEmail,
    userName: `${r.userPrenom || ''} ${r.userNom || ''}`.trim() || 'Utilisateur',
    permissionId: r.permissionId,
    permissionCode: r.permCode || '',
    permissionName: r.permName || '',
    expiresAt: r.expiresAt,
    timeRemaining: r.expiresAt.getTime() - now.getTime(),
  }));
}

/**
 * Envoyer les notifications d'avertissement pour les permissions qui expirent bientôt
 * Appelé par le cron job
 */
export async function sendExpiryWarnings(): Promise<{
  notificationsSent: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let notificationsSent = 0;

  // Vérifier les deux seuils
  const thresholds = [
    { name: '1h', ms: EXPIRY_WARNING_THRESHOLDS.ONE_HOUR },
    { name: '24h', ms: EXPIRY_WARNING_THRESHOLDS.TWENTY_FOUR_HOURS },
  ];

  for (const threshold of thresholds) {
    try {
      const expiringPerms = await getExpiringPermissions(threshold.ms);

      for (const perm of expiringPerms) {
        const notificationKey = `${perm.id}-${threshold.name}`;

        // Skip si déjà notifié pour ce seuil
        if (sentNotifications.has(notificationKey)) {
          continue;
        }

        try {
          // Notification in-app
          await sendInAppNotification({
            userId: perm.userId,
            type: 'TEMP_PERMISSION_EXPIRING',
            titre: 'Permission temporaire expirante',
            message: `Votre permission "${perm.permissionName}" expire dans ${formatTimeRemaining(perm.timeRemaining)}.`,
            priorite: threshold.name === '1h' ? 'HIGH' : 'NORMAL',
            referenceId: perm.id,
            referenceType: 'temporary_permission',
          });

          // Notification email si disponible
          if (perm.userEmail) {
            await enqueueNotification({
              channel: 'EMAIL',
              templateCode: 'TEMP_PERMISSION_EXPIRING',
              recipient: perm.userEmail,
              payload: {
                userName: perm.userName,
                permissionName: perm.permissionName,
                permissionCode: perm.permissionCode,
                expiresAt: perm.expiresAt.toLocaleString('fr-FR'),
                timeRemaining: formatTimeRemaining(perm.timeRemaining),
              },
              userId: perm.userId,
            });
          }

          // WebSocket notification
          const wsInstance = getWsInstance();
          if (wsInstance) {
            wsInstance.sendToUser(perm.userId, {
              type: 'NOTIFICATION',
              payload: {
                type: 'TEMP_PERMISSION_EXPIRING',
                message: `Votre permission "${perm.permissionName}" expire dans ${formatTimeRemaining(perm.timeRemaining)}`,
                permissionCode: perm.permissionCode,
                expiresAt: perm.expiresAt.toISOString(),
              }
            });
          }

          // Trigger webhook si configuré
          await triggerWebhook('temp_permission.expiring', {
            userId: perm.userId,
            permissionCode: perm.permissionCode,
            permissionName: perm.permissionName,
            expiresAt: perm.expiresAt.toISOString(),
            timeRemaining: perm.timeRemaining,
            threshold: threshold.name,
          });

          sentNotifications.add(notificationKey);
          notificationsSent++;

          logger.debug({
            userId: perm.userId,
            permissionCode: perm.permissionCode,
            threshold: threshold.name,
          }, 'Expiry warning sent');

        } catch (err: any) {
          errors.push(`Failed to notify ${perm.userId} for ${perm.permissionCode}: ${err.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`Failed to check ${threshold.name} threshold: ${err.message}`);
    }
  }

  // Nettoyer le set des notifications anciennes (permissions déjà expirées)
  if (sentNotifications.size > 10000) {
    sentNotifications.clear();
  }

  return { notificationsSent, errors };
}

// ============================================================================
// WEBHOOKS
// ============================================================================

/**
 * Configuration des webhooks (chargée depuis les settings ou env)
 */
interface WebhookConfig {
  url: string;
  secret?: string;
  events: string[];
  enabled: boolean;
}

let webhookConfigs: WebhookConfig[] = [];

/**
 * Charger la configuration des webhooks depuis la BDD ou les variables d'env
 */
export async function loadWebhookConfigs(): Promise<void> {
  // D'abord vérifier les variables d'environnement
  const envWebhookUrl = process.env.TEMP_PERM_WEBHOOK_URL;
  const envWebhookSecret = process.env.TEMP_PERM_WEBHOOK_SECRET;

  if (envWebhookUrl) {
    webhookConfigs = [{
      url: envWebhookUrl,
      secret: envWebhookSecret,
      events: ['temp_permission.granted', 'temp_permission.expiring', 'temp_permission.expired', 'temp_permission.revoked'],
      enabled: true,
    }];
    logger.info({ url: envWebhookUrl }, 'Webhook configuré via env');
    return;
  }

  // TODO: Charger depuis la table system_settings si besoin
  webhookConfigs = [];
}

/**
 * Déclencher un webhook pour un événement
 */
export async function triggerWebhook(
  event: string,
  payload: Record<string, any>
): Promise<void> {
  const relevantConfigs = webhookConfigs.filter(
    c => c.enabled && c.events.includes(event)
  );

  for (const config of relevantConfigs) {
    try {
      const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data: payload,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Event': event,
      };

      // Ajouter signature HMAC si secret configuré
      if (config.secret) {
        const crypto = await import('crypto');
        const signature = crypto
          .createHmac('sha256', config.secret)
          .update(body)
          .digest('hex');
        headers['X-Webhook-Signature'] = `sha256=${signature}`;
      }

      const response = await fetch(config.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (!response.ok) {
        logger.warn({
          event,
          url: config.url,
          status: response.status,
        }, 'Webhook request failed');
      } else {
        logger.debug({ event, url: config.url }, 'Webhook triggered');
      }
    } catch (err: any) {
      logger.error({
        err,
        event,
        url: config.url,
      }, 'Webhook error');
    }
  }
}

// ============================================================================
// HISTORIQUE COMPLET
// ============================================================================

export interface TempPermissionHistoryEntry {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  permissionId: string;
  permissionCode: string;
  permissionName: string;
  moduleName: string | null;
  grantedBy: string;
  granterName: string;
  grantedAt: Date;
  expiresAt: Date;
  reason: string;
  isActive: boolean;
  revokedAt: Date | null;
  revokedBy: string | null;
  revokerName: string | null;
  revokeReason: string | null;
  status: 'active' | 'expired' | 'revoked';
  duration: number; // en millisecondes
}

/**
 * Obtenir l'historique complet des permissions temporaires avec filtres
 */
export async function getTemporaryPermissionsHistory(options?: {
  userId?: string;
  permissionCode?: string;
  status?: 'active' | 'expired' | 'revoked' | 'all';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<{
  data: TempPermissionHistoryEntry[];
  total: number;
  stats: {
    totalGranted: number;
    totalActive: number;
    totalExpired: number;
    totalRevoked: number;
    avgDurationHours: number;
  };
}> {
  const {
    userId,
    permissionCode,
    status = 'all',
    startDate,
    endDate,
    limit = 50,
    offset = 0,
  } = options || {};

  const now = new Date();

  // Construire les conditions de base
  const conditions: any[] = [];

  if (userId) {
    conditions.push(eq(temporaryPermissions.userId, userId));
  }

  if (permissionCode) {
    conditions.push(eq(permissions.code, permissionCode));
  }

  if (startDate) {
    conditions.push(gte(temporaryPermissions.grantedAt, startDate));
  }

  if (endDate) {
    conditions.push(lte(temporaryPermissions.grantedAt, endDate));
  }

  // Filtrer par statut
  if (status === 'active') {
    conditions.push(eq(temporaryPermissions.isActive, true));
    conditions.push(gt(temporaryPermissions.expiresAt, now));
  } else if (status === 'expired') {
    conditions.push(eq(temporaryPermissions.isActive, false));
    conditions.push(isNull(temporaryPermissions.revokedAt));
  } else if (status === 'revoked') {
    conditions.push(eq(temporaryPermissions.isActive, false));
    conditions.push(sql`${temporaryPermissions.revokedAt} IS NOT NULL`);
  }

  // Alias pour le granter et le revoker
  const granterAlias = sql<string>`(SELECT nom || ' ' || COALESCE(prenom, '') FROM users WHERE id = ${temporaryPermissions.grantedBy})`.as('granter_name');
  const revokerAlias = sql<string>`(SELECT nom || ' ' || COALESCE(prenom, '') FROM users WHERE id = ${temporaryPermissions.revokedBy})`.as('revoker_name');
  const moduleAlias = sql<string>`(SELECT name FROM modules WHERE id = ${permissions.moduleId})`.as('module_name');

  // Requête principale
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db.select({
    id: temporaryPermissions.id,
    userId: temporaryPermissions.userId,
    permissionId: temporaryPermissions.permissionId,
    grantedBy: temporaryPermissions.grantedBy,
    grantedAt: temporaryPermissions.grantedAt,
    expiresAt: temporaryPermissions.expiresAt,
    reason: temporaryPermissions.reason,
    isActive: temporaryPermissions.isActive,
    revokedAt: temporaryPermissions.revokedAt,
    revokedBy: temporaryPermissions.revokedBy,
    revokeReason: temporaryPermissions.revokeReason,
    permCode: permissions.code,
    permName: permissions.name,
    userEmail: users.email,
    userNom: users.nom,
    userPrenom: users.prenom,
    granterName: granterAlias,
    revokerName: revokerAlias,
    moduleName: moduleAlias,
  })
    .from(temporaryPermissions)
    .leftJoin(permissions, eq(temporaryPermissions.permissionId, permissions.id))
    .leftJoin(users, eq(temporaryPermissions.userId, users.id))
    .where(whereClause)
    .orderBy(desc(temporaryPermissions.grantedAt))
    .limit(limit)
    .offset(offset);

  // Compter le total
  const [countResult] = await db.select({
    count: sql<number>`count(*)::int`,
  })
    .from(temporaryPermissions)
    .leftJoin(permissions, eq(temporaryPermissions.permissionId, permissions.id))
    .where(whereClause);

  const total = countResult?.count || 0;

  // Calculer les stats
  const [statsResult] = await db.select({
    totalGranted: sql<number>`count(*)::int`,
    totalActive: sql<number>`count(*) FILTER (WHERE ${temporaryPermissions.isActive} = true AND ${temporaryPermissions.expiresAt} > NOW())::int`,
    totalExpired: sql<number>`count(*) FILTER (WHERE ${temporaryPermissions.isActive} = false AND ${temporaryPermissions.revokedAt} IS NULL)::int`,
    totalRevoked: sql<number>`count(*) FILTER (WHERE ${temporaryPermissions.revokedAt} IS NOT NULL)::int`,
    avgDuration: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${temporaryPermissions.expiresAt} - ${temporaryPermissions.grantedAt})) * 1000), 0)::float`,
  })
    .from(temporaryPermissions);

  // Transformer les résultats
  const data: TempPermissionHistoryEntry[] = results.map(r => {
    let entryStatus: 'active' | 'expired' | 'revoked';
    if (r.revokedAt) {
      entryStatus = 'revoked';
    } else if (!r.isActive || r.expiresAt <= now) {
      entryStatus = 'expired';
    } else {
      entryStatus = 'active';
    }

    return {
      id: r.id,
      userId: r.userId,
      userName: `${r.userPrenom || ''} ${r.userNom || ''}`.trim() || 'Utilisateur',
      userEmail: r.userEmail,
      permissionId: r.permissionId,
      permissionCode: r.permCode || '',
      permissionName: r.permName || '',
      moduleName: r.moduleName,
      grantedBy: r.grantedBy,
      granterName: r.granterName || 'Inconnu',
      grantedAt: r.grantedAt,
      expiresAt: r.expiresAt,
      reason: r.reason,
      isActive: r.isActive,
      revokedAt: r.revokedAt,
      revokedBy: r.revokedBy,
      revokerName: r.revokerName,
      revokeReason: r.revokeReason,
      status: entryStatus,
      duration: r.expiresAt.getTime() - r.grantedAt.getTime(),
    };
  });

  return {
    data,
    total,
    stats: {
      totalGranted: statsResult?.totalGranted || 0,
      totalActive: statsResult?.totalActive || 0,
      totalExpired: statsResult?.totalExpired || 0,
      totalRevoked: statsResult?.totalRevoked || 0,
      avgDurationHours: (statsResult?.avgDuration || 0) / (60 * 60 * 1000),
    },
  };
}

// Charger les webhooks au démarrage
loadWebhookConfigs();
