/**
 * Enhanced Audit Trail Service
 * Provides before/after snapshots, rollback capability, and settings versioning
 */

import { db } from '../db';
import { auditLogs, users } from '@shared/schema';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import { Request } from 'express';
import { createLogger } from '../lib/logger';

const logger = createLogger('AuditTrail');

// Types
export interface AuditSnapshot {
  before: Record<string, any> | null;
  after: Record<string, any> | null;
}

export interface EnhancedAuditLogParams {
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  snapshot?: AuditSnapshot;
  statut?: 'success' | 'failure' | 'blocked';
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  isRollbackable?: boolean;
}

export interface SettingsVersion {
  id: string;
  settingsType: string;
  version: number;
  snapshot: Record<string, any>;
  changedBy: string | null;
  changedAt: Date;
  changeReason: string | null;
  isCurrent: boolean;
}

export interface PermissionAuditEntry {
  entityType: 'role' | 'user';
  entityId: string;
  permissionId?: string;
  permissionCode?: string;
  action: 'GRANT' | 'REVOKE' | 'BULK_GRANT' | 'BULK_REVOKE';
  beforeState?: Record<string, any> | null;
  afterState?: Record<string, any> | null;
  reason?: string;
}

export interface ImportBatch {
  id: string;
  importType: string;
  fileName: string | null;
  totalRecords: number;
  createdRecords: number;
  updatedRecords: number;
  skippedRecords: number;
  failedRecords: number;
  recordIds: string[];
  status: 'COMPLETED' | 'ROLLED_BACK' | 'PARTIAL';
  importedBy: string | null;
  importedAt: Date;
}

class AuditTrailService {
  /**
   * Log an audit entry with optional before/after snapshots
   */
  async logWithSnapshot(
    req: Request,
    params: EnhancedAuditLogParams
  ): Promise<string | null> {
    try {
      const userId = req.session?.userId || null;
      const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      const [result] = await db.insert(auditLogs).values({
        userId,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        details: {
          ...params.details,
          snapshot: params.snapshot,
        },
        ipAddress,
        userAgent,
        statut: params.statut || 'success',
        riskLevel: params.riskLevel || 'low',
      }).returning({ id: auditLogs.id });

      // Update with snapshot columns if available
      if (params.snapshot && result?.id) {
        await db.execute(sql`
          UPDATE audit_logs
          SET before_state = ${JSON.stringify(params.snapshot.before)}::jsonb,
              after_state = ${JSON.stringify(params.snapshot.after)}::jsonb,
              is_rollbackable = ${params.isRollbackable || false}
          WHERE id = ${result.id}::uuid
        `);
      }

      return result?.id || null;
    } catch (error) {
      logger.error({ err: error }, 'Enhanced audit log error');
      return null;
    }
  }

  /**
   * Get audit logs with pagination and filtering
   */
  async getAuditLogs(filters: {
    page?: number;
    limit?: number;
    userId?: string;
    action?: string;
    resource?: string;
    statut?: string;
    riskLevel?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  } = {}): Promise<{ data: any[]; total: number; page: number; totalPages: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    try {
      // Build conditions
      let whereClause = sql`1=1`;

      if (filters.userId) {
        whereClause = sql`${whereClause} AND user_id = ${filters.userId}::uuid`;
      }
      if (filters.action) {
        whereClause = sql`${whereClause} AND action = ${filters.action}`;
      }
      if (filters.resource) {
        whereClause = sql`${whereClause} AND resource = ${filters.resource}`;
      }
      if (filters.statut) {
        whereClause = sql`${whereClause} AND statut = ${filters.statut}`;
      }
      if (filters.riskLevel) {
        whereClause = sql`${whereClause} AND risk_level = ${filters.riskLevel}`;
      }
      if (filters.dateFrom) {
        whereClause = sql`${whereClause} AND created_at >= ${filters.dateFrom}::timestamp`;
      }
      if (filters.dateTo) {
        whereClause = sql`${whereClause} AND created_at <= ${filters.dateTo}::timestamp`;
      }
      if (filters.search) {
        const searchTerm = `%${filters.search}%`;
        whereClause = sql`${whereClause} AND (
          action ILIKE ${searchTerm} OR
          resource ILIKE ${searchTerm} OR
          resource_id ILIKE ${searchTerm} OR
          details::text ILIKE ${searchTerm}
        )`;
      }

      // Get total count
      const countQueryResult = await db.execute<{ count: string }>(sql`
        SELECT COUNT(*) as count FROM audit_logs WHERE ${whereClause}
      `);
      const total = parseInt((countQueryResult.rows[0] as any)?.count || '0', 10);

      // Get paginated data with user info
      const dataResult = await db.execute(sql`
        SELECT
          al.*,
          u.nom as user_nom,
          u.prenom as user_prenom,
          u.email as user_email
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE ${whereClause}
        ORDER BY al.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);

      return {
        data: dataResult.rows || [],
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error({ err: error }, 'Get audit logs error');
      return { data: [], total: 0, page: 1, totalPages: 0 };
    }
  }

  /**
   * Rollback an audited action
   */
  async rollback(
    auditLogId: string,
    rolledBackBy: string,
    req: Request
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get the audit log
      const auditLogResult = await db.execute<any>(sql`
        SELECT * FROM audit_logs WHERE id = ${auditLogId}::uuid
      `);
      const auditLog = auditLogResult.rows[0];

      if (!auditLog) {
        return { success: false, error: 'Entrée audit non trouvée' };
      }

      if (auditLog.rolled_back_at) {
        return { success: false, error: 'Cette action a déjà été annulée' };
      }

      if (!auditLog.is_rollbackable) {
        return { success: false, error: 'Cette action ne peut pas être annulée' };
      }

      const beforeState = auditLog.before_state;
      if (!beforeState) {
        return { success: false, error: 'Aucun état précédent disponible' };
      }

      // Restaurer l'état précédent selon le type de ressource
      const resource = auditLog.resource;
      const resourceId = auditLog.resource_id;

      const rollbackHandlers: Record<string, () => Promise<void>> = {
        user: async () => {
          const { password, ...safeState } = beforeState;
          await db.execute(sql`
            UPDATE users SET
              nom = ${safeState.nom || null},
              prenom = ${safeState.prenom || null},
              role = ${safeState.role || null},
              statut = ${safeState.statut || null},
              updated_at = NOW()
            WHERE id = ${resourceId}::uuid
          `);
        },
        settings: async () => {
          await db.execute(sql`
            UPDATE system_settings SET
              settings_data = ${JSON.stringify(beforeState)}::jsonb,
              updated_at = NOW()
            WHERE id = ${resourceId}::uuid
          `);
        },
      };

      const handler = rollbackHandlers[resource];
      if (!handler) {
        // Pour les types non supportés, on log quand même le rollback dans l'audit
        // mais on ne modifie pas la donnée
        logger.warn({ resource, resourceId }, 'Rollback: type de ressource non supporté, audit-only rollback');
      } else {
        await handler();
      }

      // Log the rollback
      const rollbackAuditId = await this.logWithSnapshot(req, {
        action: 'ROLLBACK',
        resource: auditLog.resource,
        resourceId: auditLog.resource_id,
        details: {
          originalAuditId: auditLogId,
          restoredState: beforeState,
        },
        snapshot: {
          before: auditLog.after_state,
          after: beforeState,
        },
        riskLevel: 'high',
      });

      // Mark original as rolled back
      await db.execute(sql`
        UPDATE audit_logs
        SET rolled_back_at = NOW(),
            rolled_back_by = ${rolledBackBy}::uuid,
            rollback_audit_id = ${rollbackAuditId}::uuid
        WHERE id = ${auditLogId}::uuid
      `);

      return { success: true };
    } catch (error) {
      logger.error({ err: error }, 'Rollback error');
      return { success: false, error: 'Erreur lors de l\'annulation' };
    }
  }

  // ==========================================
  // SETTINGS VERSIONING
  // ==========================================

  /**
   * Save a settings version
   */
  async saveSettingsVersion(
    settingsType: string,
    snapshot: Record<string, any>,
    changedBy: string | null,
    req: Request,
    changeReason?: string
  ): Promise<{ success: boolean; version?: number; error?: string }> {
    try {
      const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      const insertResult = await db.execute<{ version: number }>(sql`
        INSERT INTO settings_history (settings_type, snapshot, changed_by, change_reason, ip_address, user_agent)
        VALUES (${settingsType}, ${JSON.stringify(snapshot)}::jsonb, ${changedBy}::uuid, ${changeReason}, ${ipAddress}, ${userAgent})
        RETURNING version
      `);

      return { success: true, version: (insertResult.rows[0] as any)?.version };
    } catch (error) {
      logger.error({ err: error }, 'Save settings version error');
      return { success: false, error: 'Erreur lors de la sauvegarde de la version' };
    }
  }

  /**
   * Get settings version history
   */
  async getSettingsHistory(
    settingsType: string,
    limit: number = 20
  ): Promise<SettingsVersion[]> {
    try {
      const result = await db.execute(sql`
        SELECT
          sh.id,
          sh.settings_type,
          sh.version,
          sh.snapshot,
          sh.changed_by,
          sh.changed_at,
          sh.change_reason,
          sh.is_current,
          u.nom as changer_nom,
          u.prenom as changer_prenom
        FROM settings_history sh
        LEFT JOIN users u ON sh.changed_by = u.id
        WHERE sh.settings_type = ${settingsType}
        ORDER BY sh.version DESC
        LIMIT ${limit}
      `);

      return ((result as any).rows as any[]).map(row => ({
        id: row.id,
        settingsType: row.settings_type,
        version: row.version,
        snapshot: row.snapshot,
        changedBy: row.changed_by,
        changerName: row.changer_nom ? `${row.changer_prenom} ${row.changer_nom}` : null,
        changedAt: row.changed_at,
        changeReason: row.change_reason,
        isCurrent: row.is_current,
      }));
    } catch (error) {
      logger.error({ err: error }, 'Get settings history error');
      return [];
    }
  }

  /**
   * Restore settings to a specific version
   */
  async restoreSettingsVersion(
    settingsType: string,
    version: number,
    restoredBy: string,
    req: Request
  ): Promise<{ success: boolean; snapshot?: Record<string, any>; error?: string }> {
    try {
      // Get the version to restore
      const versionResult = await db.execute<any>(sql`
        SELECT snapshot FROM settings_history
        WHERE settings_type = ${settingsType} AND version = ${version}
      `);
      const versionToRestore = versionResult.rows[0];

      if (!versionToRestore) {
        return { success: false, error: 'Version non trouvée' };
      }

      // Save as new version (marks previous as not current)
      await this.saveSettingsVersion(
        settingsType,
        versionToRestore.snapshot,
        restoredBy,
        req,
        `Restauration vers version ${version}`
      );

      return { success: true, snapshot: versionToRestore.snapshot };
    } catch (error) {
      logger.error({ err: error }, 'Restore settings version error');
      return { success: false, error: 'Erreur lors de la restauration' };
    }
  }

  // ==========================================
  // PERMISSION AUDIT
  // ==========================================

  /**
   * Log a permission change
   */
  async logPermissionChange(
    entry: PermissionAuditEntry,
    changedBy: string,
    req: Request
  ): Promise<void> {
    try {
      const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';

      await db.execute(sql`
        INSERT INTO permission_audit_logs
        (entity_type, entity_id, permission_id, permission_code, action, before_state, after_state, changed_by, ip_address, reason)
        VALUES (
          ${entry.entityType},
          ${entry.entityId},
          ${entry.permissionId || null}::uuid,
          ${entry.permissionCode || null},
          ${entry.action},
          ${entry.beforeState ? JSON.stringify(entry.beforeState) : null}::jsonb,
          ${entry.afterState ? JSON.stringify(entry.afterState) : null}::jsonb,
          ${changedBy}::uuid,
          ${ipAddress},
          ${entry.reason || null}
        )
      `);
    } catch (error) {
      logger.error({ err: error }, 'Log permission change error');
    }
  }

  /**
   * Log bulk permission changes (multiple permissions at once)
   * Used for bulk grant/revoke operations
   */
  async logBulkPermissionChange(
    entries: PermissionAuditEntry[],
    changedBy: string,
    req: Request
  ): Promise<void> {
    if (entries.length === 0) return;

    try {
      const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';

      // Insert all entries in batch
      const values = entries.map(entry => ({
        entityType: entry.entityType,
        entityId: entry.entityId,
        permissionId: entry.permissionId || null,
        permissionCode: entry.permissionCode || null,
        action: entry.action,
        beforeState: entry.beforeState ? JSON.stringify(entry.beforeState) : null,
        afterState: entry.afterState ? JSON.stringify(entry.afterState) : null,
        changedBy,
        ipAddress,
        reason: entry.reason || `Bulk ${entry.action.toLowerCase()} operation`,
      }));

      // Use raw SQL for batch insert
      const valuesPlaceholders = values.map((_, idx) => {
        const base = idx * 10;
        return `($${base + 1}, $${base + 2}, $${base + 3}::uuid, $${base + 4}, $${base + 5}, $${base + 6}::jsonb, $${base + 7}::jsonb, $${base + 8}::uuid, $${base + 9}, $${base + 10})`;
      }).join(', ');

      const flatValues = values.flatMap(v => [
        v.entityType,
        v.entityId,
        v.permissionId,
        v.permissionCode,
        v.action,
        v.beforeState,
        v.afterState,
        v.changedBy,
        v.ipAddress,
        v.reason,
      ]);

      await (db.execute as any)(sql.raw(`
        INSERT INTO permission_audit_logs
        (entity_type, entity_id, permission_id, permission_code, action, before_state, after_state, changed_by, ip_address, reason)
        VALUES ${valuesPlaceholders}
      `), flatValues);
    } catch (error) {
      logger.error({ err: error }, 'Bulk log permission change error');
      // Don't throw - audit failures shouldn't break the main operation
    }
  }

  /**
   * Get permission audit history
   */
  async getPermissionAuditHistory(
    entityType?: 'role' | 'user',
    entityId?: string,
    limit: number = 50
  ): Promise<any[]> {
    try {
      let whereClause = sql`1=1`;

      if (entityType) {
        whereClause = sql`${whereClause} AND entity_type = ${entityType}`;
      }
      if (entityId) {
        whereClause = sql`${whereClause} AND entity_id = ${entityId}`;
      }

      const result = await db.execute(sql`
        SELECT
          pal.*,
          u.nom as changer_nom,
          u.prenom as changer_prenom
        FROM permission_audit_logs pal
        LEFT JOIN users u ON pal.changed_by = u.id
        WHERE ${whereClause}
        ORDER BY pal.changed_at DESC
        LIMIT ${limit}
      `);

      return (result as any).rows as any[];
    } catch (error) {
      logger.error({ err: error }, 'Get permission audit history error');
      return [];
    }
  }

  // ==========================================
  // IMPORT BATCH TRACKING
  // ==========================================

  /**
   * Create an import batch for tracking
   */
  async createImportBatch(
    importType: string,
    fileName: string | null,
    importedBy: string
  ): Promise<string | null> {
    try {
      const insertResult = await db.execute<{ id: string }>(sql`
        INSERT INTO import_batches (import_type, file_name, imported_by)
        VALUES (${importType}, ${fileName}, ${importedBy}::uuid)
        RETURNING id
      `);

      return (insertResult.rows[0] as any)?.id || null;
    } catch (error) {
      logger.error({ err: error }, 'Create import batch error');
      return null;
    }
  }

  /**
   * Update import batch with results
   */
  async updateImportBatch(
    batchId: string,
    results: {
      totalRecords: number;
      createdRecords: number;
      updatedRecords: number;
      skippedRecords: number;
      failedRecords: number;
      recordIds: string[];
      status?: 'COMPLETED' | 'PARTIAL';
      errorDetails?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      await db.execute(sql`
        UPDATE import_batches
        SET
          total_records = ${results.totalRecords},
          created_records = ${results.createdRecords},
          updated_records = ${results.updatedRecords},
          skipped_records = ${results.skippedRecords},
          failed_records = ${results.failedRecords},
          record_ids = ${JSON.stringify(results.recordIds)}::jsonb,
          status = ${results.status || 'COMPLETED'},
          error_details = ${results.errorDetails ? JSON.stringify(results.errorDetails) : null}::jsonb
        WHERE id = ${batchId}::uuid
      `);
    } catch (error) {
      logger.error({ err: error }, 'Update import batch error');
    }
  }

  /**
   * Rollback an import batch
   */
  async rollbackImportBatch(
    batchId: string,
    rolledBackBy: string
  ): Promise<{ success: boolean; deletedCount: number; error?: string }> {
    try {
      // Get the batch
      const batchResult = await db.execute<any>(sql`
        SELECT * FROM import_batches WHERE id = ${batchId}::uuid
      `);
      const batch = batchResult.rows[0];

      if (!batch) {
        return { success: false, deletedCount: 0, error: 'Batch non trouvé' };
      }

      if (batch.status === 'ROLLED_BACK') {
        return { success: false, deletedCount: 0, error: 'Ce batch a déjà été annulé' };
      }

      const recordIds = batch.record_ids || [];
      let deletedCount = 0;

      // Delete records based on import type
      // This would need to be expanded based on actual import types
      if (batch.import_type === 'users' && recordIds.length > 0) {
        const result = await db.execute(sql`
          DELETE FROM users WHERE id = ANY(${recordIds}::uuid[])
        `);
        deletedCount = recordIds.length;
      }

      // Mark batch as rolled back
      await db.execute(sql`
        UPDATE import_batches
        SET status = 'ROLLED_BACK',
            rolled_back_at = NOW(),
            rolled_back_by = ${rolledBackBy}::uuid
        WHERE id = ${batchId}::uuid
      `);

      return { success: true, deletedCount };
    } catch (error) {
      logger.error({ err: error }, 'Rollback import batch error');
      return { success: false, deletedCount: 0, error: 'Erreur lors de l\'annulation' };
    }
  }

  /**
   * Get import batch history
   */
  async getImportBatches(
    importType?: string,
    limit: number = 20
  ): Promise<ImportBatch[]> {
    try {
      let whereClause = sql`1=1`;
      if (importType) {
        whereClause = sql`${whereClause} AND import_type = ${importType}`;
      }

      const result = await db.execute(sql`
        SELECT
          ib.*,
          u.nom as importer_nom,
          u.prenom as importer_prenom
        FROM import_batches ib
        LEFT JOIN users u ON ib.imported_by = u.id
        WHERE ${whereClause}
        ORDER BY ib.imported_at DESC
        LIMIT ${limit}
      `);

      return ((result as any).rows as any[]).map(row => ({
        id: row.id,
        importType: row.import_type,
        fileName: row.file_name,
        totalRecords: row.total_records,
        createdRecords: row.created_records,
        updatedRecords: row.updated_records,
        skippedRecords: row.skipped_records,
        failedRecords: row.failed_records,
        recordIds: row.record_ids || [],
        status: row.status,
        importedBy: row.imported_by,
        importerName: row.importer_nom ? `${row.importer_prenom} ${row.importer_nom}` : null,
        importedAt: row.imported_at,
      }));
    } catch (error) {
      logger.error({ err: error }, 'Get import batches error');
      return [];
    }
  }
}

export const auditTrailService = new AuditTrailService();
