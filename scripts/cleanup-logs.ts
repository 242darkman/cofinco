#!/usr/bin/env tsx
/**
 * Script de Nettoyage Automatique des Logs
 *
 * Nettoie les fichiers de logs selon une politique de rétention:
 * - Rapports de monitoring GL: 30 jours
 * - Logs cron: 30 jours
 * - Rapports d'audit: 90 jours
 * - Logs applicatifs Winston: Gérés par winston-daily-rotate-file
 *
 * Usage:
 *   npm run cleanup:logs           # Nettoyage standard
 *   npm run cleanup:logs:dry-run   # Voir ce qui serait supprimé
 */

import * as fs from 'fs';
import * as path from 'path';

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const LOGS_DIR = path.join(process.cwd(), 'logs');

// Politiques de rétention (en jours)
const RETENTION_POLICIES = {
  'gl-monitoring': 30,      // Rapports de monitoring GL
  'audit-reports': 90,      // Rapports d'audit
  'cron-*.log': 30,         // Logs cron
};

interface CleanupStats {
  totalFiles: number;
  deletedFiles: number;
  freedSpace: number;  // en bytes
  errors: string[];
}

const stats: CleanupStats = {
  totalFiles: 0,
  deletedFiles: 0,
  freedSpace: 0,
  errors: []
};

/**
 * Vérifie si un fichier doit être supprimé selon sa date de modification
 */
function shouldDelete(filePath: string, retentionDays: number): boolean {
  try {
    const fileStats = fs.statSync(filePath);
    const fileAge = Date.now() - fileStats.mtimeMs;
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    return fileAge > retentionMs;
  } catch (error) {
    stats.errors.push(`Erreur lecture stats: ${filePath}`);
    return false;
  }
}

/**
 * Supprime un fichier et met à jour les stats
 */
function deleteFile(filePath: string): void {
  try {
    const fileStats = fs.statSync(filePath);
    const fileSize = fileStats.size;

    if (DRY_RUN) {
      console.log(`  [DRY-RUN] Supprimerait: ${path.basename(filePath)} (${formatBytes(fileSize)})`);
    } else {
      fs.unlinkSync(filePath);
      console.log(`  ✓ Supprimé: ${path.basename(filePath)} (${formatBytes(fileSize)})`);
    }

    stats.deletedFiles++;
    stats.freedSpace += fileSize;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    stats.errors.push(`Erreur suppression ${filePath}: ${message}`);
    console.log(`  ❌ Erreur: ${path.basename(filePath)} - ${message}`);
  }
}

/**
 * Nettoie un répertoire selon une politique de rétention
 */
function cleanupDirectory(dirPath: string, retentionDays: number): void {
  if (!fs.existsSync(dirPath)) {
    console.log(`  ⚠️  Répertoire introuvable: ${path.basename(dirPath)}`);
    return;
  }

  console.log(`\n📁 Nettoyage: ${path.basename(dirPath)} (rétention: ${retentionDays} jours)`);

  const files = fs.readdirSync(dirPath);
  let foundFiles = 0;

  for (const file of files) {
    // Ignorer les fichiers cachés et les liens symboliques
    if (file.startsWith('.') || file.startsWith('_')) {
      continue;
    }

    const filePath = path.join(dirPath, file);
    const fileStats = fs.statSync(filePath);

    // Ignorer les répertoires
    if (fileStats.isDirectory()) {
      continue;
    }

    foundFiles++;
    stats.totalFiles++;

    if (shouldDelete(filePath, retentionDays)) {
      deleteFile(filePath);
    }
  }

  if (foundFiles === 0) {
    console.log('  (aucun fichier à nettoyer)');
  } else if (stats.deletedFiles === 0) {
    console.log('  ✓ Tous les fichiers sont dans la période de rétention');
  }
}

/**
 * Nettoie les fichiers de logs selon un pattern
 */
function cleanupLogsByPattern(pattern: string, retentionDays: number): void {
  console.log(`\n📝 Nettoyage: ${pattern} (rétention: ${retentionDays} jours)`);

  if (!fs.existsSync(LOGS_DIR)) {
    console.log('  ⚠️  Répertoire logs/ introuvable');
    return;
  }

  const files = fs.readdirSync(LOGS_DIR);
  const regex = new RegExp(pattern.replace('*', '.*'));
  let foundFiles = 0;

  for (const file of files) {
    if (regex.test(file)) {
      const filePath = path.join(LOGS_DIR, file);
      const fileStats = fs.statSync(filePath);

      if (fileStats.isFile()) {
        foundFiles++;
        stats.totalFiles++;

        if (shouldDelete(filePath, retentionDays)) {
          deleteFile(filePath);
        }
      }
    }
  }

  if (foundFiles === 0) {
    console.log('  (aucun fichier correspondant)');
  } else if (stats.deletedFiles === 0) {
    console.log('  ✓ Tous les fichiers sont dans la période de rétention');
  }
}

/**
 * Formate les bytes en format lisible
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Nettoie les fichiers .gz compressés anciens
 */
function cleanupCompressedLogs(): void {
  console.log('\n🗜️  Nettoyage: Logs compressés .gz (rétention: 90 jours)');

  if (!fs.existsSync(LOGS_DIR)) {
    return;
  }

  const files = fs.readdirSync(LOGS_DIR);
  let foundFiles = 0;

  for (const file of files) {
    if (file.endsWith('.gz')) {
      const filePath = path.join(LOGS_DIR, file);
      foundFiles++;
      stats.totalFiles++;

      if (shouldDelete(filePath, 90)) {
        deleteFile(filePath);
      }
    }
  }

  if (foundFiles === 0) {
    console.log('  (aucun fichier .gz)');
  }
}

/**
 * Fonction principale
 */
async function cleanupLogs(): Promise<void> {
  console.log('=== NETTOYAGE AUTOMATIQUE DES LOGS ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (simulation)' : 'PRODUCTION'}`);
  console.log(`Date: ${new Date().toLocaleString('fr-FR')}\n`);

  try {
    // 1. Nettoyer les rapports de monitoring GL
    const monitoringDir = path.join(LOGS_DIR, 'gl-monitoring');
    cleanupDirectory(monitoringDir, RETENTION_POLICIES['gl-monitoring']);

    // 2. Nettoyer les rapports d'audit
    const auditDir = path.join(LOGS_DIR, 'audit-reports');
    cleanupDirectory(auditDir, RETENTION_POLICIES['audit-reports']);

    // 3. Nettoyer les logs cron
    cleanupLogsByPattern('cron-*.log', RETENTION_POLICIES['cron-*.log']);

    // 4. Nettoyer les fichiers compressés anciens
    cleanupCompressedLogs();

    // 5. Résumé
    console.log('\n=== RÉSUMÉ ===');
    console.log(`Fichiers analysés:  ${stats.totalFiles}`);
    console.log(`Fichiers supprimés: ${stats.deletedFiles}`);
    console.log(`Espace libéré:      ${formatBytes(stats.freedSpace)}`);

    if (stats.errors.length > 0) {
      console.log(`\n⚠️  Erreurs: ${stats.errors.length}`);
      stats.errors.forEach(err => console.log(`  - ${err}`));
    }

    if (DRY_RUN) {
      console.log('\n💡 Exécuter sans --dry-run pour effectuer le nettoyage réel');
    } else if (stats.deletedFiles > 0) {
      console.log('\n✅ Nettoyage terminé avec succès!');
    } else {
      console.log('\n✅ Aucun fichier à nettoyer (tous dans la période de rétention)');
    }

    console.log('\n=== FIN DU NETTOYAGE ===');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Erreur critique durant le nettoyage:', error);
    process.exit(1);
  }
}

// Exécution
cleanupLogs();
