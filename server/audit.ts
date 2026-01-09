import { db } from './db';
import { auditLogs, loginAttempts, InsertAuditLog, InsertLoginAttempt } from '@shared/schema';
import { Request } from 'express';
import { eq, and, gte, lte, desc, sql, count } from 'drizzle-orm';

export async function logAudit(
  req: Request,
  action: string,
  resource: string,
  resourceId?: string,
  details?: Record<string, any>,
  status: 'success' | 'failure' | 'blocked' = 'success',
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
      status,
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
          status,
          riskLevel,
        });
        console.warn('Audit log logged as anonymous due to missing user:', req.session?.userId);
        return;
      } catch (retryError) {
        console.error('Audit log retry error:', retryError);
      }
    }
    console.error('Audit log error:', error);
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
    console.error('Login attempt log error:', error);
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
    console.error('Failed attempts check error:', error);
    return 0;
  }
}

export async function isAccountLocked(username: string, maxAttempts: number = 5): Promise<boolean> {
  const failedAttempts = await getRecentFailedAttempts(username, 15);
  // Account is only locked if there are maxAttempts failures within the 15-minute window
  // The window automatically expires after 15 minutes (checked in getRecentFailedAttempts)
  return failedAttempts >= maxAttempts;
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
    
    console.log(`Login successful for ${username}, lockout counter cleared`);
  } catch (error) {
    console.error('Clear login attempts error:', error);
  }
}

export async function getAuditLogs(
  filters?: {
    userId?: string;
    action?: string;
    resource?: string;
    status?: string;
    limit?: number;
  }
): Promise<any[]> {
  try {
    let query = db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt));

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }

    return await query;
  } catch (error) {
    console.error('Get audit logs error:', error);
    return [];
  }
}

export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    errors.push(`Le mot de passe doit contenir au moins ${PASSWORD_REQUIREMENTS.minLength} caractères`);
  }

  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins une lettre majuscule');
  }

  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins une lettre minuscule');
  }

  if (PASSWORD_REQUIREMENTS.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins un chiffre');
  }

  if (PASSWORD_REQUIREMENTS.requireSpecialChars && !/[@$!%*?&]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins un caractère spécial (@$!%*?&)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// AUDIT LOG PURGE SYSTEM (Every 3 months)
// ============================================

const RETENTION_MONTHS = 3;

export async function purgeOldAuditLogs(): Promise<{ deletedCount: number; error?: string }> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - RETENTION_MONTHS);

    // Count logs to be deleted (for reporting)
    const [countResult] = await db.select({ count: count() })
      .from(auditLogs)
      .where(lte(auditLogs.createdAt, cutoffDate));

    const logsToDelete = countResult?.count || 0;

    if (logsToDelete > 0) {
      // Delete old audit logs
      await db.delete(auditLogs)
        .where(lte(auditLogs.createdAt, cutoffDate));

      console.log(`[AUDIT PURGE] Deleted ${logsToDelete} audit logs older than ${cutoffDate.toISOString()}`);
    }

    // Also purge old login attempts (same retention)
    await db.delete(loginAttempts)
      .where(lte(loginAttempts.createdAt, cutoffDate));

    return { deletedCount: Number(logsToDelete) };
  } catch (error) {
    console.error('[AUDIT PURGE] Error:', error);
    return { deletedCount: 0, error: String(error) };
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
    console.error('[AUDIT STATS] Error:', error);
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
    console.log('[AUDIT PURGE] Running scheduled purge...');
    await purgeOldAuditLogs();
  }, 60 * 1000);

  // Then every 24 hours
  setInterval(async () => {
    console.log('[AUDIT PURGE] Running daily scheduled purge...');
    await purgeOldAuditLogs();
  }, INTERVAL_MS);

  console.log(`[AUDIT PURGE] Scheduled to run daily. Retention period: ${RETENTION_MONTHS} months.`);
}
