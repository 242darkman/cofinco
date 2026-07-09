/**
 * Cron Job: Nettoyage automatique des fichiers de logs
 * =====================================================
 *
 * Exécute un nettoyage hebdomadaire des fichiers de logs selon
 * les politiques de rétention définies:
 * - Rapports GL monitoring: 30 jours
 * - Rapports d'audit: 90 jours
 * - Logs cron: 30 jours
 * - Fichiers .gz compressés: 90 jours
 */

import * as fs from 'fs';
import * as path from 'path';
import cron from 'node-cron';
import { createLogger } from '../lib/logger';

const logger = createLogger('Cron:LogCleanup');

const LOGS_DIR = path.join(process.cwd(), 'logs');

const RETENTION_POLICIES: Record<string, number> = {
  'gl-monitoring': 30,
  'audit-reports': 90,
  'cron-logs': 30,
  'compressed': 90,
};

function cleanDirectory(dirPath: string, retentionDays: number): { deleted: number; freed: number } {
  let deleted = 0;
  let freed = 0;

  if (!fs.existsSync(dirPath)) return { deleted, freed };

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  for (const file of fs.readdirSync(dirPath)) {
    if (file.startsWith('.')) continue;
    const filePath = path.join(dirPath, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile() && stat.mtimeMs < cutoff) {
        freed += stat.size;
        fs.unlinkSync(filePath);
        deleted++;
      }
    } catch {
      // skip inaccessible files
    }
  }

  return { deleted, freed };
}

function cleanByPattern(dir: string, pattern: RegExp, retentionDays: number): { deleted: number; freed: number } {
  let deleted = 0;
  let freed = 0;

  if (!fs.existsSync(dir)) return { deleted, freed };

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  for (const file of fs.readdirSync(dir)) {
    if (!pattern.test(file)) continue;
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile() && stat.mtimeMs < cutoff) {
        freed += stat.size;
        fs.unlinkSync(filePath);
        deleted++;
      }
    } catch {
      // skip
    }
  }

  return { deleted, freed };
}

async function runLogCleanup(): Promise<void> {
  logger.info('Starting scheduled log cleanup');
  let totalDeleted = 0;
  let totalFreed = 0;

  // GL monitoring reports
  const gl = cleanDirectory(path.join(LOGS_DIR, 'gl-monitoring'), RETENTION_POLICIES['gl-monitoring']);
  totalDeleted += gl.deleted;
  totalFreed += gl.freed;

  // Audit reports
  const audit = cleanDirectory(path.join(LOGS_DIR, 'audit-reports'), RETENTION_POLICIES['audit-reports']);
  totalDeleted += audit.deleted;
  totalFreed += audit.freed;

  // Cron log files
  const cronLogs = cleanByPattern(LOGS_DIR, /^cron-.*\.log$/, RETENTION_POLICIES['cron-logs']);
  totalDeleted += cronLogs.deleted;
  totalFreed += cronLogs.freed;

  // Compressed .gz files
  const compressed = cleanByPattern(LOGS_DIR, /\.gz$/, RETENTION_POLICIES['compressed']);
  totalDeleted += compressed.deleted;
  totalFreed += compressed.freed;

  if (totalDeleted > 0) {
    const freedMB = (totalFreed / (1024 * 1024)).toFixed(2);
    logger.info({ deletedFiles: totalDeleted, freedMB }, 'Log cleanup completed');
  } else {
    logger.info('Log cleanup: no files to clean');
  }
}

export function startLogCleanupCron(): void {
  // Every Sunday at 5 AM
  cron.schedule('0 5 * * 0', () => {
    runLogCleanup().catch(err => logger.error({ err }, 'Log cleanup failed'));
  });

  logger.info('Log cleanup cron scheduled (Sunday 05:00)');
}
