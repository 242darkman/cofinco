import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  DeleteBucketPolicyCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand
} from '@aws-sdk/client-s3';
import { createLogger } from '../lib/logger';

const logger = createLogger('Storage');
import {
  StorageFileType,
  StorageEntityType,
  getStoragePath,
  isPublicFileType,
  STORAGE_CONFIG
} from '@shared/config/storage-paths';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  region: process.env.MINIO_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER!,
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD!,
  },
  forcePathStyle: true, // Required for MinIO
});

const PUBLIC_BUCKET = process.env.BUCKET_PUBLIC_NAME || 'public-assets';
const PRIVATE_BUCKET = process.env.BUCKET_PRIVATE_NAME || 'secure-docs';

// Patterns d'URLs MinIO à nettoyer
const URL_PATTERNS = [
  /^https?:\/\/[^/]+\/public-assets\//,
  /^https?:\/\/[^/]+\/secure-docs\//,
];

// Pattern pour détecter les double-prefixes
const DOUBLE_PREFIX_PATTERN = /^(https?:\/\/[^/]+\/[^/]+\/)(https?:\/\/.+)$/;

export class StorageService {

  // ============================================
  // UTILITAIRES DE NETTOYAGE D'URLS
  // ============================================

  /**
   * Extrait l'Object Key d'une URL ou d'un chemin potentiellement malformé.
   * Cette fonction est "Tolérante en lecture" - elle accepte différents formats
   * et retourne toujours un object key propre.
   *
   * @param input - URL complète, object key, ou chemin malformé
   * @returns Object key nettoyé ou null si invalide
   */
  static extractKeyFromUrl(input: string | null | undefined): string | null {
    if (!input || typeof input !== 'string') return null;

    const trimmed = input.trim();
    if (!trimmed) return null;

    // Ignorer les data URIs
    if (trimmed.startsWith('data:')) return null;

    // Conserver les URLs externes (Google Auth, Facebook, etc.)
    if (trimmed.startsWith('https://lh3.googleusercontent.com')) return trimmed;
    if (trimmed.startsWith('https://graph.facebook.com')) return trimmed;

    // Corriger les double-prefixes d'abord (http://host/bucket/http://host/bucket/key)
    const doubleMatch = trimmed.match(DOUBLE_PREFIX_PATTERN);
    if (doubleMatch) {
      return this.extractKeyFromUrl(doubleMatch[2]);
    }

    // Si c'est une URL MinIO, extraire le chemin après le bucket
    for (const pattern of URL_PATTERNS) {
      if (pattern.test(trimmed)) {
        const cleaned = trimmed.replace(pattern, '');
        return cleaned.replace(/\/+/g, '/').replace(/^\//, '') || null;
      }
    }

    // Si c'est une autre URL HTTP
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const url = new URL(trimmed);
        const pathParts = url.pathname.split('/').filter(Boolean);

        // Vérifier si c'est un bucket connu
        if (pathParts[0] === PUBLIC_BUCKET || pathParts[0] === PRIVATE_BUCKET) {
          return pathParts.slice(1).join('/').replace(/\/+/g, '/') || null;
        }

        // URL externe inconnue, retourner telle quelle (peut être une URL OAuth)
        return trimmed;
      } catch {
        return null;
      }
    }

    // C'est déjà un chemin relatif, nettoyer
    let cleaned = trimmed.replace(/\/+/g, '/').replace(/^\//, '');

    // Supprimer le préfixe bucket si présent dans le chemin
    if (cleaned.startsWith(`${PUBLIC_BUCKET}/`)) {
      cleaned = cleaned.slice(PUBLIC_BUCKET.length + 1);
    } else if (cleaned.startsWith(`${PRIVATE_BUCKET}/`)) {
      cleaned = cleaned.slice(PRIVATE_BUCKET.length + 1);
    }

    return cleaned || null;
  }

  /**
   * Détermine si une URL/chemin pointe vers le bucket public
   */
  static isPublicPath(input: string | null | undefined): boolean {
    if (!input) return false;
    const trimmed = input.trim();

    // Vérifier dans l'URL
    if (trimmed.includes(`/${PUBLIC_BUCKET}/`)) return true;
    if (trimmed.startsWith(`${PUBLIC_BUCKET}/`)) return true;

    // Par défaut, les profils/avatars sont publics
    if (trimmed.startsWith('profiles/') || trimmed.startsWith('avatars/')) return true;

    return false;
  }

  // ============================================
  // INITIALISATION
  // ============================================

  /**
   * Initialize buckets on startup
   */
  static async initializeBuckets() {
    logger.info('Initializing MinIO buckets');
    await this.createBucketIfNotExists(PUBLIC_BUCKET, true);
    await this.createBucketIfNotExists(PRIVATE_BUCKET, false);
    await this.ensurePrivateBucket(PRIVATE_BUCKET);
    logger.info('Buckets initialized');
  }

  /**
   * Create bucket if it doesn't exist
   */
  private static async createBucketIfNotExists(bucket: string, isPublic: boolean) {
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      logger.debug({ bucket }, 'Bucket exists');
    } catch (error: any) {
      if (error.name === 'NotFound' || error.name === 'NoSuchBucket') {
        await s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
        logger.info({ bucket }, 'Created bucket');

        if (isPublic) {
          await this.makePublicReadable(bucket);
          logger.info({ bucket }, 'Made bucket publicly readable');
        }
      } else {
        logger.error({ err: error, bucket }, 'Error checking bucket');
      }
    }
  }

  /**
   * Make bucket publicly readable
   */
  private static async makePublicReadable(bucket: string) {
    const policy = {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: '*',
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`]
      }]
    };

    await s3Client.send(new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify(policy)
    }));
  }

  private static async ensurePrivateBucket(bucket: string) {
    try {
      await s3Client.send(new DeleteBucketPolicyCommand({ Bucket: bucket }));
      logger.debug({ bucket }, 'Removed bucket policy');
    } catch (error: any) {
      const noPolicy =
        error?.name === 'NoSuchBucketPolicy' ||
        error?.name === 'NoSuchBucket' ||
        error?.Code === 'NoSuchBucketPolicy';
      if (!noPolicy) {
        logger.error({ err: error, bucket }, 'Error removing policy');
      }
    }
  }

  /**
   * Upload file to MinIO
   * IMPORTANT: Retourne TOUJOURS l'object key, jamais l'URL complète.
   * C'est la règle "Strict en écriture" - on stocke uniquement les keys.
   */
  static async uploadFile(
    file: Express.Multer.File,
    path: string,
    isPublic: boolean = false
  ): Promise<string> {
    const bucket = isPublic ? PUBLIC_BUCKET : PRIVATE_BUCKET;
    const sanitizedName = this.sanitizeFilename(file.originalname);
    const key = `${path}/${Date.now()}-${sanitizedName}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        originalName: this.sanitizeMetadataValue(file.originalname),
        uploadedAt: new Date().toISOString(),
      }
    }));

    // TOUJOURS retourner l'object key, pas l'URL
    return key;
  }

  /**
   * Upload from buffer (for migration)
   * Retourne TOUJOURS l'object key.
   */
  static async uploadBuffer(
    buffer: Buffer,
    filename: string,
    contentType: string,
    path: string,
    isPublic: boolean = false
  ): Promise<string> {
    const bucket = isPublic ? PUBLIC_BUCKET : PRIVATE_BUCKET;
    const sanitizedName = this.sanitizeFilename(filename);
    const key = `${path}/${sanitizedName}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));

    // TOUJOURS retourner l'object key
    return key;
  }

  /**
   * Generate presigned upload URL (for direct client upload)
   */
  static async getPresignedUploadUrl(
    filename: string,
    contentType: string,
    path: string,
    isPublic: boolean = false
  ): Promise<{ uploadUrl: string; objectKey: string }> {
    const bucket = isPublic ? PUBLIC_BUCKET : PRIVATE_BUCKET;
    const sanitizedName = this.sanitizeFilename(filename);
    const key = `${path}/${Date.now()}-${sanitizedName}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 min

    return {
      uploadUrl,
      objectKey: key
    };
  }

  /**
   * Generate presigned download URL (for secure document access)
   */
  static async getPresignedDownloadUrl(
    objectKey: string,
    expiresIn: number = 900 // 15 min
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: PRIVATE_BUCKET,
      Key: objectKey,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  }

  /**
   * Get public object stream
   */
  static async getPublicObject(objectKey: string) {
    const command = new GetObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: objectKey,
    });

    return await s3Client.send(command);
  }

  /**
   * Get private object stream
   */
  static async getPrivateObject(objectKey: string) {
    const command = new GetObjectCommand({
      Bucket: PRIVATE_BUCKET,
      Key: objectKey,
    });

    return await s3Client.send(command);
  }

  /**
   * Delete file
   */
  static async deleteFile(objectKey: string, isPublic: boolean = false): Promise<void> {
    const bucket = isPublic ? PUBLIC_BUCKET : PRIVATE_BUCKET;

    await s3Client.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    }));
  }

  /**
   * Get public URL for an object key
   * @param objectKey - L'object key (pas une URL complète)
   */
  static getPublicUrl(objectKey: string | null | undefined): string | null {
    if (!objectKey) return null;

    // Si c'est déjà une URL externe (OAuth), retourner telle quelle
    if (objectKey.startsWith('https://lh3.googleusercontent.com')) return objectKey;
    if (objectKey.startsWith('https://graph.facebook.com')) return objectKey;

    // Extraire la clé propre si c'est une URL malformée
    const cleanKey = this.extractKeyFromUrl(objectKey);
    if (!cleanKey) return null;

    // Si c'est une URL externe après nettoyage, retourner telle quelle
    if (cleanKey.startsWith('http://') || cleanKey.startsWith('https://')) {
      return cleanKey;
    }

    return `${process.env.MINIO_ENDPOINT}/${PUBLIC_BUCKET}/${cleanKey}`;
  }

  /**
   * Supprime un fichier à partir de son URL ou de son object key.
   * Utilise extractKeyFromUrl pour nettoyer l'entrée.
   */
  static async deleteFileFromUrl(urlOrKey: string | null | undefined): Promise<boolean> {
    if (!urlOrKey) return false;

    // Ignorer les data URIs et URLs trop courtes
    if (urlOrKey.startsWith('data:') || urlOrKey.length < 5) return false;

    // Ignorer les URLs externes (OAuth)
    if (urlOrKey.startsWith('https://lh3.googleusercontent.com')) return false;
    if (urlOrKey.startsWith('https://graph.facebook.com')) return false;

    // Extraire la clé propre
    const cleanKey = this.extractKeyFromUrl(urlOrKey);
    if (!cleanKey || cleanKey.startsWith('http')) {
      // C'est une URL externe, on ne peut pas la supprimer
      return false;
    }

    // Déterminer si c'est public ou privé
    const isPublic = this.isPublicPath(urlOrKey);

    try {
      await this.deleteFile(cleanKey, isPublic);
      logger.info({ key: cleanKey, bucket: isPublic ? 'public' : 'private' }, 'Deleted file');
      return true;
    } catch (error: any) {
      // Si le fichier n'existe pas, ce n'est pas une erreur critique
      if (error?.name === 'NoSuchKey') {
        logger.warn({ key: cleanKey }, 'File not found for deletion');
        return false;
      }
      logger.error({ err: error, key: cleanKey }, 'Error deleting file');
      throw error;
    }
  }

  /**
   * Sanitize value for S3 Metadata (US-ASCII only)
   * This prevents 'SignatureDoesNotMatch' errors when filenames contain accents
   */
  private static sanitizeMetadataValue(value: string): string {
    if (!value) return '';
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^\x00-\x7F]/g, '?');  // Replace any other non-ASCII with ?
  }

  /**
   * Sanitize filename to be ASCII-safe for S3/MinIO
   */
  private static sanitizeFilename(filename: string): string {
    // Split into name and extension
    const lastDotIndex = filename.lastIndexOf('.');
    let name = filename;
    let ext = '';

    if (lastDotIndex !== -1) {
      name = filename.substring(0, lastDotIndex);
      ext = filename.substring(lastDotIndex).toLowerCase(); // Extension stays lowercase
    }

    const sanitizedName = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-zA-Z0-9-]/g, '-')   // Replace non-alphanumeric with -
      .replace(/-+/g, '-')             // Collapse dashes
      .replace(/^-+|-+$/g, '')         // Trim dashes
      .toLowerCase();

    // Ensure extension only contains alphanumeric characters and a single leading dot
    const sanitizedExt = ext.replace(/[^a-z0-9.]/g, '');

    return sanitizedName + sanitizedExt;
  }

  // ============================================
  // ORGANISATION PAR ENTITÉ (V2)
  // ============================================

  /**
   * Upload un fichier avec organisation par entité
   * Chemin généré: {basePath}/{entityType}/{entityId}/{timestamp}-{filename}
   *
   * @param file - Fichier à uploader
   * @param fileType - Type de fichier (profile, kyc, credit, etc.)
   * @param entityType - Type d'entité (client, user, employe)
   * @param entityId - ID de l'entité
   * @returns Object key (à stocker en DB)
   */
  static async uploadForEntity(
    file: Express.Multer.File,
    fileType: StorageFileType,
    entityType: StorageEntityType,
    entityId: string
  ): Promise<string> {
    const path = getStoragePath(fileType, entityType, entityId);
    const isPublic = isPublicFileType(fileType);
    return await this.uploadFile(file, path, isPublic);
  }

  /**
   * Upload un buffer avec organisation par entité
   */
  static async uploadBufferForEntity(
    buffer: Buffer,
    filename: string,
    contentType: string,
    fileType: StorageFileType,
    entityType: StorageEntityType,
    entityId: string
  ): Promise<string> {
    const path = getStoragePath(fileType, entityType, entityId);
    const isPublic = isPublicFileType(fileType);
    return await this.uploadBuffer(buffer, filename, contentType, path, isPublic);
  }

  /**
   * Génère une URL présignée avec organisation par entité
   */
  static async getPresignedUploadUrlForEntity(
    filename: string,
    contentType: string,
    fileType: StorageFileType,
    entityType: StorageEntityType,
    entityId: string
  ): Promise<{ uploadUrl: string; objectKey: string }> {
    const path = getStoragePath(fileType, entityType, entityId);
    const isPublic = isPublicFileType(fileType);
    return await this.getPresignedUploadUrl(filename, contentType, path, isPublic);
  }

  // ============================================
  // SUPPRESSION EN CASCADE
  // ============================================

  /**
   * Liste tous les fichiers d'une entité dans un bucket
   *
   * @param bucket - Nom du bucket
   * @param entityType - Type d'entité
   * @param entityId - ID de l'entité
   * @returns Liste des object keys
   */
  private static async listEntityFiles(
    bucket: string,
    entityType: StorageEntityType,
    entityId: string
  ): Promise<string[]> {
    const allKeys: string[] = [];

    // Chercher dans tous les chemins de base possibles
    for (const [_, config] of Object.entries(STORAGE_CONFIG) as [string, { bucket: string; basePath: string }][]) {
      if ((config.bucket === 'public' && bucket === PUBLIC_BUCKET) ||
          (config.bucket === 'private' && bucket === PRIVATE_BUCKET)) {
        const prefix = `${config.basePath}/${entityType}/${entityId}/`;

        try {
          let continuationToken: string | undefined;

          do {
            const response = await s3Client.send(new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: prefix,
              ContinuationToken: continuationToken,
            }));

            if (response.Contents) {
              allKeys.push(...response.Contents.map(obj => obj.Key!).filter(Boolean));
            }

            continuationToken = response.NextContinuationToken;
          } while (continuationToken);
        } catch (error: any) {
          // Ignorer les erreurs de listing (bucket/prefix inexistant)
          if (error?.name !== 'NoSuchBucket') {
            logger.warn({ err: error, prefix }, 'Error listing files for prefix');
          }
        }
      }
    }

    return allKeys;
  }

  /**
   * Supprime tous les fichiers d'une entité (CASCADE DELETE)
   * Utilisé lors de la suppression d'un client, employé, etc.
   *
   * @param entityType - Type d'entité (client, user, employe)
   * @param entityId - ID de l'entité
   * @returns Nombre de fichiers supprimés
   */
  static async deleteEntityFiles(
    entityType: StorageEntityType,
    entityId: string
  ): Promise<{ publicDeleted: number; privateDeleted: number }> {
    let publicDeleted = 0;
    let privateDeleted = 0;

    // Supprimer les fichiers publics
    const publicKeys = await this.listEntityFiles(PUBLIC_BUCKET, entityType, entityId);
    if (publicKeys.length > 0) {
      publicDeleted = await this.deleteMultipleFiles(PUBLIC_BUCKET, publicKeys);
      logger.info({ count: publicDeleted, entityType, entityId }, 'Deleted public files');
    }

    // Supprimer les fichiers privés
    const privateKeys = await this.listEntityFiles(PRIVATE_BUCKET, entityType, entityId);
    if (privateKeys.length > 0) {
      privateDeleted = await this.deleteMultipleFiles(PRIVATE_BUCKET, privateKeys);
      logger.info({ count: privateDeleted, entityType, entityId }, 'Deleted private files');
    }

    return { publicDeleted, privateDeleted };
  }

  // ============================================
  // RELOCATION D'ENTITÉ (TEMP ID → REAL ID)
  // ============================================

  /**
   * Déplace tous les fichiers d'une entité d'un ancien ID vers un nouvel ID.
   * Utilisé après la création d'une entité pour relocaliser les fichiers
   * uploadés sous un UUID temporaire vers le vrai ID de l'entité.
   *
   * @param entityType - Type d'entité (client, user, employe, prospection)
   * @param oldEntityId - Ancien ID (UUID temporaire)
   * @param newEntityId - Nouvel ID (vrai UUID de l'entité)
   * @returns Map<oldKey, newKey> pour mettre à jour les références en BDD
   */
  static async relocateEntityFiles(
    entityType: StorageEntityType,
    oldEntityId: string,
    newEntityId: string
  ): Promise<Map<string, string>> {
    const keyMapping = new Map<string, string>();

    if (oldEntityId === newEntityId) return keyMapping;

    for (const bucket of [PUBLIC_BUCKET, PRIVATE_BUCKET]) {
      const oldKeys = await this.listEntityFiles(bucket, entityType, oldEntityId);

      for (const oldKey of oldKeys) {
        const newKey = oldKey.replace(
          `/${entityType}/${oldEntityId}/`,
          `/${entityType}/${newEntityId}/`
        );

        try {
          // Copy to new location
          await s3Client.send(new CopyObjectCommand({
            Bucket: bucket,
            CopySource: `${bucket}/${oldKey}`,
            Key: newKey,
          }));

          // Delete old object
          await s3Client.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: oldKey,
          }));

          keyMapping.set(oldKey, newKey);
        } catch (error: any) {
          logger.error({ err: error, oldKey, newKey }, 'Failed to relocate file');
          // Continue with other files
        }
      }
    }

    if (keyMapping.size > 0) {
      logger.info({ count: keyMapping.size, entityType, oldEntityId, newEntityId }, 'Relocated files');
    }

    return keyMapping;
  }

  /**
   * Supprime plusieurs fichiers en batch (max 1000 par appel S3)
   */
  private static async deleteMultipleFiles(
    bucket: string,
    keys: string[]
  ): Promise<number> {
    if (keys.length === 0) return 0;

    let totalDeleted = 0;

    // S3 limite à 1000 objets par DeleteObjects
    const batches = [];
    for (let i = 0; i < keys.length; i += 1000) {
      batches.push(keys.slice(i, i + 1000));
    }

    for (const batch of batches) {
      try {
        const response = await s3Client.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: batch.map(key => ({ Key: key })),
            Quiet: true,
          },
        }));

        // Compter les suppressions réussies
        totalDeleted += batch.length - (response.Errors?.length || 0);

        if (response.Errors && response.Errors.length > 0) {
          logger.warn({ errors: response.Errors }, 'Failed to delete some files');
        }
      } catch (error: any) {
        logger.error({ err: error }, 'Error batch deleting files');
      }
    }

    return totalDeleted;
  }

  /**
   * Supprime un fichier spécifique d'une entité (ex: ancien avatar)
   * Utile pour remplacer un fichier existant
   */
  static async deleteEntityFile(
    fileType: StorageFileType,
    entityType: StorageEntityType,
    entityId: string,
    filename: string
  ): Promise<boolean> {
    const config = STORAGE_CONFIG[fileType];
    const bucket = config.bucket === 'public' ? PUBLIC_BUCKET : PRIVATE_BUCKET;
    const key = `${config.basePath}/${entityType}/${entityId}/${filename}`;

    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }));
      logger.info({ key }, 'Deleted file');
      return true;
    } catch (error: any) {
      if (error?.name === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Compte les fichiers d'une entité (pour info/debug)
   */
  static async countEntityFiles(
    entityType: StorageEntityType,
    entityId: string
  ): Promise<{ public: number; private: number }> {
    const publicKeys = await this.listEntityFiles(PUBLIC_BUCKET, entityType, entityId);
    const privateKeys = await this.listEntityFiles(PRIVATE_BUCKET, entityType, entityId);

    return {
      public: publicKeys.length,
      private: privateKeys.length,
    };
  }

  /**
   * Liste tous les fichiers d'une entité avec métadonnées
   */
  static async getEntityFiles(
    entityType: StorageEntityType,
    entityId: string
  ): Promise<Array<{ key: string; name: string; url: string | null; bucket: 'public' | 'private'; size?: number; lastModified?: Date }>> {
    const files: Array<{ key: string; name: string; url: string | null; bucket: 'public' | 'private'; size?: number; lastModified?: Date }> = [];

    // Public files
    for (const [_, config] of Object.entries(STORAGE_CONFIG) as [string, { bucket: string; basePath: string }][]) {
      if (config.bucket === 'public') {
        const prefix = `${config.basePath}/${entityType}/${entityId}/`;
        try {
          let continuationToken: string | undefined;
          do {
            const response = await s3Client.send(new ListObjectsV2Command({
              Bucket: PUBLIC_BUCKET,
              Prefix: prefix,
              ContinuationToken: continuationToken,
            }));
            if (response.Contents) {
              for (const obj of response.Contents) {
                if (obj.Key) {
                  files.push({
                    key: obj.Key,
                    name: obj.Key.split('/').pop() || obj.Key,
                    url: this.getPublicUrl(obj.Key),
                    bucket: 'public',
                    size: obj.Size,
                    lastModified: obj.LastModified,
                  });
                }
              }
            }
            continuationToken = response.NextContinuationToken;
          } while (continuationToken);
        } catch (error: any) {
          if (error?.name !== 'NoSuchBucket') {
            logger.warn({ err: error, prefix }, 'Error listing public files');
          }
        }
      }
    }

    // Private files
    for (const [_, config] of Object.entries(STORAGE_CONFIG) as [string, { bucket: string; basePath: string }][]) {
      if (config.bucket === 'private') {
        const prefix = `${config.basePath}/${entityType}/${entityId}/`;
        try {
          let continuationToken: string | undefined;
          do {
            const response = await s3Client.send(new ListObjectsV2Command({
              Bucket: PRIVATE_BUCKET,
              Prefix: prefix,
              ContinuationToken: continuationToken,
            }));
            if (response.Contents) {
              for (const obj of response.Contents) {
                if (obj.Key) {
                  files.push({
                    key: obj.Key,
                    name: obj.Key.split('/').pop() || obj.Key,
                    url: null, // Private files need signed URL
                    bucket: 'private',
                    size: obj.Size,
                    lastModified: obj.LastModified,
                  });
                }
              }
            }
            continuationToken = response.NextContinuationToken;
          } while (continuationToken);
        } catch (error: any) {
          if (error?.name !== 'NoSuchBucket') {
            logger.warn({ err: error, prefix }, 'Error listing private files');
          }
        }
      }
    }

    return files;
  }
}
