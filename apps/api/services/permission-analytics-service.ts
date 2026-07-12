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
import { eq, sql } from 'drizzle-orm';
import { permissionAnalyticsConfig, permissionUsageLogs } from '@shared/schema';
import { createLogger } from '../lib/logger';
import { toPermissionUsageLogInsert } from './permission-analytics-mappers';
import type {
  AnalyticsConfig,
  PermissionCheckLog,
  PermissionDenialStats,
  PermissionStats,
  UnusedPermission,
} from './permission-analytics-types';

const logger = createLogger('PermissionAnalytics');

type ConfigKey = keyof AnalyticsConfig;

const CONFIG_DB_KEYS: Record<ConfigKey, string> = {
  enabled: 'enabled',
  samplingRateAllowed: 'sampling_rate_allowed',
  samplingRateDenied: 'sampling_rate_denied',
  batchSize: 'batch_size',
  flushIntervalMs: 'flush_interval_ms',
  retentionDays: 'retention_days',
};

const CONFIG_KEY_BY_DB_KEY: Record<string, ConfigKey> = Object.fromEntries(
  Object.entries(CONFIG_DB_KEYS).map(([key, dbKey]) => [dbKey, key as ConfigKey]),
);

const DEFAULT_CONFIG: AnalyticsConfig = {
  enabled: false,
  samplingRateAllowed: 0.01,
  samplingRateDenied: 1.0,
  batchSize: 100,
  flushIntervalMs: 5000,
  retentionDays: 30,
};

/**
 * Service d'analytics des permissions
 */
class PermissionAnalyticsService {
  private config: AnalyticsConfig = { ...DEFAULT_CONFIG };

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
      const rows = await db
        .select({
          key: permissionAnalyticsConfig.key,
          value: permissionAnalyticsConfig.value,
        })
        .from(permissionAnalyticsConfig);

      for (const row of rows) {
        applyConfigValue(this.config, row.key, row.value);
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
      await db.insert(permissionUsageLogs).values(logsToInsert.map(toPermissionUsageLogInsert));
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
    for (const [key, value] of Object.entries(updates)) {
      const dbKey = CONFIG_DB_KEYS[key as keyof AnalyticsConfig];
      if (dbKey) {
        await db
          .update(permissionAnalyticsConfig)
          .set({ value, updatedAt: new Date() })
          .where(eq(permissionAnalyticsConfig.key, dbKey));
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
  async getTopDenials(limit = 10): Promise<PermissionDenialStats[]> {
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
      return (result.rows as unknown as Array<{
        permissionCode: string;
        deniedCount: string | number;
        uniqueUsers: string | number;
        lastDenied: Date;
      }>).map(row => ({
        permissionCode: row.permissionCode,
        deniedCount: Number(row.deniedCount),
        uniqueUsers: Number(row.uniqueUsers),
        lastDenied: row.lastDenied,
      }));
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
      const deleted = Number(result.rows[0]?.purge_old_permission_logs ?? 0);
      logger.info({ deleted }, 'Purged old logs');
      return deleted;
    } catch (error) {
      logger.error({ err: error }, 'Purge failed');
      return 0;
    }
  }
}

function applyConfigValue(config: AnalyticsConfig, dbKey: string, value: unknown): void {
  const key = CONFIG_KEY_BY_DB_KEY[dbKey];
  if (!key) return;

  if (key === 'enabled') {
    config.enabled = value === true || value === 'true';
    return;
  }

  const numericValue = toFiniteNumber(value);
  if (numericValue === null) return;
  config[key] = numericValue;
}

function toFiniteNumber(value: unknown): number | null {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

// Singleton instance
export const permissionAnalytics = new PermissionAnalyticsService();
