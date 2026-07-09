/**
 * Permission Analytics Service
 * ============================
 *
 * Collecte optionnelle de métriques sur l'utilisation des permissions.
 * Conçu pour un impact minimal sur les performances:
 *
 * - Échantillonnage configurable (1% allowed, 100% denied par défaut)
 * - Inserts en batch (buffer mémoire, flush périodique)
 * - Activation/désactivation dynamique via config
 * - Rétention automatique avec purge
 *
 * @example
 * ```typescript
 * import { permissionAnalytics } from './permission-analytics-service';
 *
 * // Log une vérification
 * permissionAnalytics.logCheck({
 *   userId: 'xxx',
 *   userRole: 'CAISSIER',
 *   permissionCode: 'caisse.deposit',
 *   action: 'deposit',
 *   subject: 'Caisse',
 *   allowed: true,
 *   agenceId: 'yyy',
 *   endpoint: '/api/caisse/deposit',
 *   ipAddress: '192.168.1.1'
 * });
 * ```
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { createLogger } from '../lib/logger';

const logger = createLogger('PermissionAnalytics');

/**
 * Configuration des analytics
 */
interface AnalyticsConfig {
  enabled: boolean;
  samplingRateAllowed: number;
  samplingRateDenied: number;
  batchSize: number;
  flushIntervalMs: number;
  retentionDays: number;
}

/**
 * Entrée de log de vérification
 */
export interface PermissionCheckLog {
  userId: string;
  userRole: string;
  permissionCode: string;
  action: string;
  subject: string;
  allowed: boolean;
  deniedReason?: string;
  agenceId?: string;
  resourceId?: string;
  resourceType?: string;
  endpoint?: string;
  ipAddress?: string;
}

/**
 * Statistiques agrégées par permission
 */
export interface PermissionStats {
  permissionCode: string;
  action: string;
  subject: string;
  totalChecks: number;
  allowedCount: number;
  deniedCount: number;
  uniqueUsers: number;
  allowRate: number;
  firstCheck: Date;
  lastCheck: Date;
}

/**
 * Permission inutilisée
 */
export interface UnusedPermission {
  id: string;
  code: string;
  name: string;
  moduleName: string;
  createdAt: Date;
}

/**
 * Service d'analytics des permissions
 */
class PermissionAnalyticsService {
  private config: AnalyticsConfig = {
    enabled: false,
    samplingRateAllowed: 0.01,
    samplingRateDenied: 1.0,
    batchSize: 100,
    flushIntervalMs: 5000,
    retentionDays: 30,
  };

  private buffer: PermissionCheckLog[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;

  /**
   * Initialiser le service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.loadConfig();
      this.startFlushTimer();
      this.isInitialized = true;
      logger.info({
        enabled: this.config.enabled,
        samplingAllowed: `${this.config.samplingRateAllowed * 100}%`,
        samplingDenied: `${this.config.samplingRateDenied * 100}%`,
      }, 'Service initialized');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize');
    }
  }

  /**
   * Charger la configuration depuis la base
   */
  private async loadConfig(): Promise<void> {
    try {
      const result = await db.execute<{ key: string; value: any }>(
        sql`SELECT key, value FROM permission_analytics_config`
      );

      for (const row of result.rows as any[]) {
        switch (row.key) {
          case 'enabled':
            this.config.enabled = row.value === 'true' || row.value === true;
            break;
          case 'sampling_rate_allowed':
            this.config.samplingRateAllowed = parseFloat(row.value);
            break;
          case 'sampling_rate_denied':
            this.config.samplingRateDenied = parseFloat(row.value);
            break;
          case 'batch_size':
            this.config.batchSize = parseInt(row.value);
            break;
          case 'flush_interval_ms':
            this.config.flushIntervalMs = parseInt(row.value);
            break;
          case 'retention_days':
            this.config.retentionDays = parseInt(row.value);
            break;
        }
      }
    } catch (error) {
      // Table might not exist yet
      logger.warn('Config table not ready');
    }
  }

  /**
   * Démarrer le timer de flush périodique
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushIntervalMs);
  }

  /**
   * Arrêter le service
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush remaining logs
    await this.flush();
    this.isInitialized = false;
  }

  /**
   * Log une vérification de permission
   */
  logCheck(log: PermissionCheckLog): void {
    if (!this.config.enabled) return;

    // Échantillonnage
    const samplingRate = log.allowed
      ? this.config.samplingRateAllowed
      : this.config.samplingRateDenied;

    if (Math.random() > samplingRate) return;

    // Ajouter au buffer
    this.buffer.push(log);

    // Flush si buffer plein
    if (this.buffer.length >= this.config.batchSize) {
      this.flush();
    }
  }

  /**
   * Flush le buffer vers la base de données
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const logsToInsert = [...this.buffer];
    this.buffer = [];

    try {
      // Construire l'insert batch
      const values = logsToInsert.map(log => `(
        gen_random_uuid(),
        '${log.userId}',
        '${log.userRole}',
        '${log.permissionCode}',
        '${log.action}',
        '${log.subject}',
        ${log.allowed},
        ${log.deniedReason ? `'${log.deniedReason.replace(/'/g, "''")}'` : 'NULL'},
        ${log.agenceId ? `'${log.agenceId}'` : 'NULL'},
        ${log.resourceId ? `'${log.resourceId}'` : 'NULL'},
        ${log.resourceType ? `'${log.resourceType}'` : 'NULL'},
        ${log.endpoint ? `'${log.endpoint}'` : 'NULL'},
        ${log.ipAddress ? `'${log.ipAddress}'::INET` : 'NULL'},
        NOW()
      )`).join(',');

      await db.execute(sql.raw(`
        INSERT INTO permission_usage_logs (
          id, user_id, user_role, permission_code, action, subject,
          allowed, denied_reason, agence_id, resource_id, resource_type,
          endpoint, ip_address, checked_at
        ) VALUES ${values}
      `));
    } catch (error) {
      logger.error({ err: error }, 'Flush failed');
      // On ne remet pas les logs en buffer pour éviter une boucle infinie
    }
  }

  /**
   * Obtenir la configuration actuelle
   */
  getConfig(): AnalyticsConfig {
    return { ...this.config };
  }

  /**
   * Mettre à jour la configuration
   */
  async updateConfig(updates: Partial<AnalyticsConfig>): Promise<void> {
    const configMap: Record<keyof AnalyticsConfig, string> = {
      enabled: 'enabled',
      samplingRateAllowed: 'sampling_rate_allowed',
      samplingRateDenied: 'sampling_rate_denied',
      batchSize: 'batch_size',
      flushIntervalMs: 'flush_interval_ms',
      retentionDays: 'retention_days',
    };

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = configMap[key as keyof AnalyticsConfig];
      if (dbKey) {
        await db.execute(sql`
          UPDATE permission_analytics_config
          SET value = ${JSON.stringify(value)}, updated_at = NOW()
          WHERE key = ${dbKey}
        `);
      }
    }

    // Recharger la config
    await this.loadConfig();

    // Redémarrer le timer si l'intervalle a changé
    if (updates.flushIntervalMs) {
      this.startFlushTimer();
    }
  }

  /**
   * Obtenir les statistiques de permissions
   */
  async getStats(): Promise<PermissionStats[]> {
    try {
      const result = await db.execute(sql`
        SELECT
          permission_code as "permissionCode",
          action,
          subject,
          total_checks as "totalChecks",
          allowed_count as "allowedCount",
          denied_count as "deniedCount",
          unique_users as "uniqueUsers",
          allow_rate as "allowRate",
          first_check as "firstCheck",
          last_check as "lastCheck"
        FROM permission_usage_stats
        ORDER BY total_checks DESC
      `);
      return result.rows as unknown as PermissionStats[];
    } catch (error) {
      logger.error({ err: error }, 'Failed to get stats');
      return [];
    }
  }

  /**
   * Obtenir les permissions les plus refusées
   */
  async getTopDenials(limit = 10): Promise<Array<{
    permissionCode: string;
    deniedCount: number;
    uniqueUsers: number;
    lastDenied: Date;
  }>> {
    try {
      const result = await db.execute(sql`
        SELECT
          permission_code as "permissionCode",
          COUNT(*) as "deniedCount",
          COUNT(DISTINCT user_id) as "uniqueUsers",
          MAX(checked_at) as "lastDenied"
        FROM permission_usage_logs
        WHERE allowed = false
        GROUP BY permission_code
        ORDER BY "deniedCount" DESC
        LIMIT ${limit}
      `);
      return result.rows as any[];
    } catch (error) {
      logger.error({ err: error }, 'Failed to get denials');
      return [];
    }
  }

  /**
   * Obtenir les permissions inutilisées
   */
  async getUnusedPermissions(): Promise<UnusedPermission[]> {
    try {
      const result = await db.execute(sql`
        SELECT
          id,
          code,
          name,
          module_name as "moduleName",
          created_at as "createdAt"
        FROM unused_permissions
      `);
      return result.rows as unknown as UnusedPermission[];
    } catch (error) {
      logger.error({ err: error }, 'Failed to get unused');
      return [];
    }
  }

  /**
   * Rafraîchir les statistiques matérialisées
   */
  async refreshStats(): Promise<void> {
    try {
      await db.execute(sql`SELECT refresh_permission_stats()`);
    } catch (error) {
      logger.error({ err: error }, 'Failed to refresh stats');
    }
  }

  /**
   * Purger les anciens logs
   */
  async purgeOldLogs(daysToKeep?: number): Promise<number> {
    try {
      const days = daysToKeep ?? this.config.retentionDays;
      const result = await db.execute<{ purge_old_permission_logs: number }>(
        sql`SELECT purge_old_permission_logs(${days})`
      );
      const deleted = (result.rows[0] as any)?.purge_old_permission_logs ?? 0;
      logger.info({ deleted }, 'Purged old logs');
      return deleted;
    } catch (error) {
      logger.error({ err: error }, 'Purge failed');
      return 0;
    }
  }
}

// Singleton instance
export const permissionAnalytics = new PermissionAnalyticsService();
