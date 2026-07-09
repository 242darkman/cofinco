/**
 * Cron Job: Nettoyage des fichiers MinIO orphelins
 * ==================================================
 *
 * Exécute un scan mensuel pour détecter et supprimer les fichiers
 * stockés dans MinIO qui ne sont plus référencés en base de données.
 *
 * Fichiers vérifiés:
 * - profiles/ → users.avatar_url, clients.photo_url
 * - kyc/ → client_documents.document_url
 * - credits/ → credit dossier photos
 * - employes/ → employee_documents.storage_key, employee_payslips.storage_key
 *
 * Sécurité: Ne supprime que les fichiers > 24h (évite de supprimer
 * des uploads en cours non encore liés à une entité).
 */

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import cron from 'node-cron';
import { createLogger } from '../lib/logger';

const logger = createLogger('Cron:StorageOrphanCleanup');

const s3Client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  region: process.env.MINIO_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER!,
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD!,
  },
  forcePathStyle: true,
});

const PUBLIC_BUCKET = process.env.BUCKET_PUBLIC_NAME || 'public-assets';
const PRIVATE_BUCKET = process.env.BUCKET_PRIVATE_NAME || 'secure-docs';

// Fichiers de moins de 24h ne sont jamais supprimés (upload en cours possible)
const MIN_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Liste toutes les clés d'un bucket MinIO
 */
async function listAllKeys(bucket: string): Promise<{ key: string; lastModified: Date }[]> {
  const keys: { key: string; lastModified: Date }[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3Client.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
    }));

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key && obj.LastModified) {
          keys.push({ key: obj.Key, lastModified: obj.LastModified });
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return keys;
}

/**
 * Collecte tous les object keys référencés en base de données.
 * Requête union sur toutes les tables qui stockent des références MinIO.
 */
async function getReferencedKeys(): Promise<Set<string>> {
  const keys = new Set<string>();

  // Requête unique avec UNION pour récupérer toutes les références en une passe
  const results = await db.execute(sql`
    SELECT DISTINCT val FROM (
      SELECT avatar_url AS val FROM users WHERE avatar_url IS NOT NULL AND avatar_url != ''
      UNION ALL
      SELECT photo_url AS val FROM clients WHERE photo_url IS NOT NULL AND photo_url != ''
      UNION ALL
      SELECT document_url AS val FROM client_documents WHERE document_url IS NOT NULL AND document_url != ''
      UNION ALL
      SELECT storage_key AS val FROM employee_documents WHERE storage_key IS NOT NULL AND storage_key != ''
      UNION ALL
      SELECT storage_key AS val FROM employee_payslips WHERE storage_key IS NOT NULL AND storage_key != ''
      UNION ALL
      SELECT document_url AS val FROM employee_sanctions WHERE document_url IS NOT NULL AND document_url != ''
      UNION ALL
      SELECT photo_url AS val FROM credit_dossier_photos WHERE photo_url IS NOT NULL AND photo_url != ''
      UNION ALL
      SELECT photo_url AS val FROM investigation_photos WHERE photo_url IS NOT NULL AND photo_url != ''
      UNION ALL
      SELECT logo_url AS val FROM system_settings WHERE logo_url IS NOT NULL AND logo_url != ''
      UNION ALL
      SELECT logo_url AS val FROM payment_methods WHERE logo_url IS NOT NULL AND logo_url != ''
    ) AS all_refs
  `);

  for (const row of results.rows as any[]) {
    if (row.val) {
      // Normaliser: peut être une URL complète ou juste un object key
      let key = String(row.val);
      // Extraire le key si c'est une URL complète (http://minio:9000/bucket/key)
      const bucketPrefixes = [
        `${process.env.MINIO_ENDPOINT || 'http://localhost:9000'}/${PUBLIC_BUCKET}/`,
        `${process.env.MINIO_ENDPOINT || 'http://localhost:9000'}/${PRIVATE_BUCKET}/`,
        `/${PUBLIC_BUCKET}/`,
        `/${PRIVATE_BUCKET}/`,
      ];
      for (const prefix of bucketPrefixes) {
        if (key.startsWith(prefix)) {
          key = key.substring(prefix.length);
          break;
        }
      }
      keys.add(key);
    }
  }

  return keys;
}

/**
 * Supprime les fichiers orphelins d'un bucket
 */
async function deleteOrphans(bucket: string, orphanKeys: string[]): Promise<number> {
  if (orphanKeys.length === 0) return 0;

  let deleted = 0;
  // S3 DeleteObjects accepte max 1000 clés par appel
  for (let i = 0; i < orphanKeys.length; i += 1000) {
    const batch = orphanKeys.slice(i, i + 1000);
    try {
      await s3Client.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map(key => ({ Key: key })) },
      }));
      deleted += batch.length;
    } catch (err) {
      logger.error({ err, bucket, batchSize: batch.length }, 'Error deleting orphan batch');
    }
  }

  return deleted;
}

async function runOrphanCleanup(): Promise<void> {
  logger.info('Starting MinIO orphan cleanup');

  try {
    const referencedKeys = await getReferencedKeys();
    logger.info({ referencedCount: referencedKeys.size }, 'Collected referenced keys from database');

    const cutoff = Date.now() - MIN_AGE_MS;
    let totalOrphans = 0;
    let totalDeleted = 0;

    for (const bucket of [PUBLIC_BUCKET, PRIVATE_BUCKET]) {
      try {
        const allFiles = await listAllKeys(bucket);
        const orphans = allFiles
          .filter(f => f.lastModified.getTime() < cutoff)
          .filter(f => !referencedKeys.has(f.key))
          .map(f => f.key);

        totalOrphans += orphans.length;

        if (orphans.length > 0) {
          logger.info({ bucket, orphanCount: orphans.length }, 'Found orphan files');
          const deleted = await deleteOrphans(bucket, orphans);
          totalDeleted += deleted;
        }
      } catch (err) {
        logger.error({ err, bucket }, 'Error scanning bucket for orphans');
      }
    }

    logger.info({ totalOrphans, totalDeleted }, 'MinIO orphan cleanup completed');
  } catch (err) {
    logger.error({ err }, 'MinIO orphan cleanup failed');
  }
}

export function startStorageOrphanCleanupCron(): void {
  // 1er du mois à 4h30
  cron.schedule('30 4 1 * *', () => {
    runOrphanCleanup().catch(err => logger.error({ err }, 'Storage orphan cleanup cron failed'));
  });

  logger.info('Storage orphan cleanup cron scheduled (1st of month 04:30)');
}
