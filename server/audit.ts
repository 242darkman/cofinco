import { db } from './db';
import { auditLogs, loginAttempts, InsertAuditLog, InsertLoginAttempt, securitySettings } from '@shared/schema';
import { Request } from 'express';
import { eq, and, gte, lte, desc, asc, sql, count } from 'drizzle-orm';
import { createLogger } from './lib/logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('Audit');

export async function logAudit(
  req: Request,
  action: string,
  resource: string,
  resourceId?: string,
  details?: Record<string, any>,
  statut: 'success' | 'failure' | 'blocked' = 'success',
  riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
): Promise<void> {
  try {
    const userId = req.session?.userId || null;
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    await db.insert(auditLogs).values({
      userId,
      action,
      resource,
      resourceId,
      details,
      ipAddress,
      userAgent,
      statut,
      riskLevel,
    });
  } catch (error: any) {
    if (error.code === '23503' && error.constraint === 'audit_logs_user_id_users_id_fk') {
      // User likely deleted or invalid session, retry as anonymous
      try {
        await db.insert(auditLogs).values({
          userId: null,
          action,
          resource,
          resourceId,
          details: { ...details, original_user_id: req.session?.userId },
          ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          statut,
          riskLevel,
        });
        logger.warn({ userId: req.session?.userId }, 'Audit log logged as anonymous due to missing user');
        return;
      } catch (retryError) {
        logger.error({ err: retryError }, 'Audit log retry error');
      }
    }
    logger.error({ err: error }, 'Audit log error');
  }
}

export async function logLoginAttempt(
  username: string,
  req: Request,
  success: boolean,
  reason?: string
): Promise<void> {
  try {
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';

    await db.insert(loginAttempts).values({
      username,
      ipAddress,
      success,
      reason,
    });
  } catch (error) {
    logger.error({ err: error }, 'Login attempt log error');
  }
}

export async function getRecentFailedAttempts(
  username: string,
  windowMinutes: number = 15
): Promise<number> {
  try {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    
    const attempts = await db
      .select()
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.username, username),
          eq(loginAttempts.success, false),
          gte(loginAttempts.createdAt, windowStart)
        )
      );

    return attempts.length;
  } catch (error) {
    logger.error({ err: error }, 'Failed attempts check error');
    return 0;
  }
}

export async function isAccountLocked(username: string, maxAttempts: number = 5): Promise<boolean> {
  const failedAttempts = await getRecentFailedAttempts(username, 15);
  // Account is only locked if there are maxAttempts failures within the 15-minute window
  // The window automatically expires after 15 minutes (checked in getRecentFailedAttempts)
  return failedAttempts >= maxAttempts;
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;

/**
 * Retourne les infos de verrouillage pour un utilisateur :
 * - locked: si le compte est verrouillé
 * - failedAttempts: nombre de tentatives échouées dans la fenêtre
 * - remainingAttempts: tentatives restantes avant verrouillage
 * - lockedUntil: date de fin du verrouillage (ISO string)
 * - retryAfterSeconds: secondes avant de pouvoir réessayer
 */
export async function getLoginLockoutInfo(username: string): Promise<{
  locked: boolean;
  failedAttempts: number;
  remainingAttempts: number;
  lockedUntil: string | null;
  retryAfterSeconds: number;
}> {
  const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000);

  try {
    // Compter les tentatives échouées et récupérer la plus ancienne
    const attempts = await db
      .select({ createdAt: loginAttempts.createdAt })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.username, username),
          eq(loginAttempts.success, false),
          gte(loginAttempts.createdAt, windowStart)
        )
      )
      .orderBy(asc(loginAttempts.createdAt));

    const failedAttempts = attempts.length;
    const locked = failedAttempts >= MAX_LOGIN_ATTEMPTS;
    const remainingAttempts = Math.max(0, MAX_LOGIN_ATTEMPTS - failedAttempts);

    if (locked && attempts.length > 0) {
      // Le verrouillage expire quand la 1ère tentative sort de la fenêtre
      const earliestAttempt = attempts[0].createdAt!;
      const lockedUntil = new Date(earliestAttempt.getTime() + LOCKOUT_WINDOW_MINUTES * 60 * 1000);
      const retryAfterSeconds = Math.max(0, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));

      return { locked, failedAttempts, remainingAttempts, lockedUntil: lockedUntil.toISOString(), retryAfterSeconds };
    }

    return { locked, failedAttempts, remainingAttempts, lockedUntil: null, retryAfterSeconds: 0 };
  } catch (error) {
    logger.error({ err: error }, 'Lockout info check error');
    return { locked: false, failedAttempts: 0, remainingAttempts: MAX_LOGIN_ATTEMPTS, lockedUntil: null, retryAfterSeconds: 0 };
  }
}

export async function clearLoginAttemptsOnSuccess(username: string): Promise<void> {
  // After successful login, we mark recent failed attempts as resolved
  // by recording a successful login. The next check will see 0 failures
  // because successful logins reset the count within the window
  try {
    const windowStart = new Date(Date.now() - 15 * 60 * 1000);
    
    // Delete failed attempts within the window to reset lockout state
    await db
      .delete(loginAttempts)
      .where(
        and(
          eq(loginAttempts.username, username),
          eq(loginAttempts.success, false),
          gte(loginAttempts.createdAt, windowStart)
        )
      );
    
    logger.info({ username }, 'Login successful, lockout counter cleared');
  } catch (error) {
    logger.error({ err: error }, 'Clear login attempts error');
  }
}

export async function getAuditLogs(
  filters?: {
    userId?: string;
    action?: string;
    resource?: string;
    statut?: string;
    limit?: number;
  }
): Promise<any[]> {
  try {
    const conditions = [];

    if (filters?.userId) {
      conditions.push(eq(auditLogs.userId, filters.userId));
    }
    if (filters?.action) {
      conditions.push(eq(auditLogs.action, filters.action));
    }
    if (filters?.resource) {
      conditions.push(eq(auditLogs.resource, filters.resource));
    }
    if (filters?.statut) {
      conditions.push(eq(auditLogs.statut, filters.statut));
    }

    let query = conditions.length > 0
      ? db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt))
      : db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt));

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }

    return await query;
  } catch (error) {
    logger.error({ err: error }, 'Get audit logs error');
    return [];
  }
}

export interface PasswordRequirements {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

export const DEFAULT_PASSWORD_REQUIREMENTS: PasswordRequirements = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

export async function getPasswordRequirements(): Promise<PasswordRequirements> {
  try {
    const [settings] = await db.select().from(securitySettings).limit(1);
    if (!settings) return DEFAULT_PASSWORD_REQUIREMENTS;

    return {
      minLength: settings.passwordMinLength ?? DEFAULT_PASSWORD_REQUIREMENTS.minLength,
      requireUppercase: settings.passwordRequireUppercase ?? DEFAULT_PASSWORD_REQUIREMENTS.requireUppercase,
      requireLowercase: settings.passwordRequireLowercase ?? DEFAULT_PASSWORD_REQUIREMENTS.requireLowercase,
      requireNumbers: settings.passwordRequireNumbers ?? DEFAULT_PASSWORD_REQUIREMENTS.requireNumbers,
      requireSpecialChars: settings.passwordRequireSpecial ?? DEFAULT_PASSWORD_REQUIREMENTS.requireSpecialChars,
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to load security settings for password rules');
    return DEFAULT_PASSWORD_REQUIREMENTS;
  }
}

export function validatePassword(
  password: string,
  requirements: PasswordRequirements = DEFAULT_PASSWORD_REQUIREMENTS
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < requirements.minLength) {
    errors.push(`Le mot de passe doit contenir au moins ${requirements.minLength} caractères`);
  }

  if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins une lettre majuscule');
  }

  if (requirements.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins une lettre minuscule');
  }

  if (requirements.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins un chiffre');
  }

  if (requirements.requireSpecialChars && !/[@$!%*?&]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins un caractère spécial (@$!%*?&)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// AUDIT LOG ARCHIVE & PURGE SYSTEM
// ============================================
// Rétention en BDD: 6 mois.
// Les logs > 6 mois sont archivés en fichier JSONL puis supprimés de la BDD.
// Les archives sont conservées dans logs/audit-archives/ (rétention fichier: illimitée).

const RETENTION_MONTHS = 6;
const ARCHIVE_BATCH_SIZE = 5000;
const ARCHIVE_DIR = path.join(process.cwd(), 'logs', 'audit-archives');

export async function purgeOldAuditLogs(): Promise<{ archivedCount: number; deletedCount: number; error?: string }> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - RETENTION_MONTHS);

    // Count logs to archive
    const [countResult] = await db.select({ count: count() })
      .from(auditLogs)
      .where(lte(auditLogs.createdAt, cutoffDate));

    const logsToArchive = Number(countResult?.count || 0);

    if (logsToArchive === 0) {
      return { archivedCount: 0, deletedCount: 0 };
    }

    logger.info({ logsToArchive, cutoffDate: cutoffDate.toISOString() }, 'AUDIT PURGE: Starting archive');

    // Ensure archive directory exists
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

    // Archive in batches to avoid memory pressure
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveFile = path.join(ARCHIVE_DIR, `audit-logs-${timestamp}.jsonl`);
    const writeStream = fs.createWriteStream(archiveFile, { encoding: 'utf-8' });

    let archived = 0;
    let lastId: string | null = null;

    while (true) {
      const batch = lastId
        ? await db.select().from(auditLogs)
            .where(and(lte(auditLogs.createdAt, cutoffDate), sql`${auditLogs.id} > ${lastId}`))
            .orderBy(asc(auditLogs.id))
            .limit(ARCHIVE_BATCH_SIZE)
        : await db.select().from(auditLogs)
            .where(lte(auditLogs.createdAt, cutoffDate))
            .orderBy(asc(auditLogs.id))
            .limit(ARCHIVE_BATCH_SIZE);

      if (batch.length === 0) break;

      for (const log of batch) {
        writeStream.write(JSON.stringify(log) + '\n');
      }

      lastId = batch[batch.length - 1].id;
      archived += batch.length;
    }

    writeStream.end();
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    logger.info({ archived, archiveFile }, 'AUDIT PURGE: Archive written');

    // Delete archived logs from database
    const deleteResult = await db.delete(auditLogs)
      .where(lte(auditLogs.createdAt, cutoffDate));

    const deletedCount = (deleteResult as any).rowCount ?? archived;
    logger.info({ deletedCount, archiveFile }, 'AUDIT PURGE: Old logs deleted from database');

    return { archivedCount: archived, deletedCount };
  } catch (error) {
    logger.error({ err: error }, 'AUDIT PURGE: Error during archive/purge');
    return { archivedCount: 0, deletedCount: 0, error: String(error) };
  }
}

export async function getAuditLogStats(): Promise<{
  totalLogs: number;
  oldestLogDate: Date | null;
  logsToDelete: number;
  retentionMonths: number;
}> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - RETENTION_MONTHS);

    // Total count
    const [totalResult] = await db.select({ count: count() }).from(auditLogs);

    // Oldest log
    const [oldestLog] = await db.select({ createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .orderBy(auditLogs.createdAt)
      .limit(1);

    // Logs to be purged
    const [deleteResult] = await db.select({ count: count() })
      .from(auditLogs)
      .where(lte(auditLogs.createdAt, cutoffDate));

    return {
      totalLogs: Number(totalResult?.count || 0),
      oldestLogDate: oldestLog?.createdAt || null,
      logsToDelete: Number(deleteResult?.count || 0),
      retentionMonths: RETENTION_MONTHS
    };
  } catch (error) {
    logger.error({ err: error }, 'AUDIT STATS: Error getting stats');
    return { totalLogs: 0, oldestLogDate: null, logsToDelete: 0, retentionMonths: RETENTION_MONTHS };
  }
}

// Scheduled purge job (can be called by cron or startup)
let purgeScheduled = false;

export function scheduleAuditPurge(): void {
  if (purgeScheduled) return;
  purgeScheduled = true;

  // Run every 24 hours
  const INTERVAL_MS = 24 * 60 * 60 * 1000;

  // Initial purge after 1 minute (let server start first)
  setTimeout(async () => {
    logger.info('AUDIT PURGE: Running scheduled purge');
    await purgeOldAuditLogs();
  }, 60 * 1000);

  // Then every 24 hours
  setInterval(async () => {
    logger.info('AUDIT PURGE: Running daily scheduled purge');
    await purgeOldAuditLogs();
  }, INTERVAL_MS);

  logger.info({ retentionMonths: RETENTION_MONTHS }, 'AUDIT PURGE: Scheduled to run daily');
}
