import { Router } from 'express';
import multer from 'multer';
import { StorageService } from '../services/storage-service';
import { requireAuth } from '../auth';
import { db } from '../db';
import { clients } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { SystemRole, normalizeRole } from '@shared/types/roles';
import {
  StorageFileType,
  StorageEntityType,
  STORAGE_CONFIG,
  isPublicFileType
} from '@shared/config/storage-paths';

// Derive valid types from config — single source of truth
const validFileTypes = Object.keys(STORAGE_CONFIG) as StorageFileType[];
const validEntityTypes: StorageEntityType[] = ['client', 'user', 'employe', 'credit', 'tontine', 'prospection'];

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé. Formats acceptés: JPEG, PNG, PDF'));
    }
  }
});

// ============================================
// ROUTES PUBLIQUES (fichiers publics)
// ============================================

/**
 * GET /api/storage/files/:key(*)
 * Servir les fichiers publics avec cache
 */
router.get('/files/:key(*)', async (req, res) => {
  const rawKey = req.params.key;
  if (!rawKey) {
    return res.status(400).json({ error: 'File key is required' });
  }

  // Nettoyer la clé (au cas où elle contient une URL)
  const key = StorageService.extractKeyFromUrl(rawKey);
  if (!key) {
    return res.status(400).json({ error: 'Invalid file key' });
  }

  // Si c'est une URL externe, rediriger
  if (key.startsWith('http://') || key.startsWith('https://')) {
    return res.redirect(key);
  }

  try {
    const result = await StorageService.getPublicObject(key);

    if (!result?.Body) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (result.ContentType) {
      res.setHeader('Content-Type', result.ContentType);
    }
    if (result.ContentLength) {
      res.setHeader('Content-Length', String(result.ContentLength));
    }

    // Cache public pendant 1 heure
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const body = result.Body as any;
    if (body && typeof body.pipe === 'function') {
      body.pipe(res);
      return;
    }

    return res.status(500).json({ error: 'Invalid file stream' });
  } catch (error: any) {
    if (error?.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'File not found' });
    }
    console.error('Public file fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch file' });
  }
});

// ============================================
// ROUTES AUTHENTIFIÉES
// ============================================

/**
 * GET /api/storage/documents/:id/view
 * Get secure download URL for private documents
 */
router.get('/documents/:id/view', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const user = (req as any).user as { id: string; role?: string };
    const normalizedRole = normalizeRole(user?.role);

    if (!normalizedRole) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    let objectKey: string | null = null;
    let ownerId: string | null = null;

    // Chercher dans les documents JSONB des clients
    if (!objectKey) {
      const clientDocResult = await db.execute(sql`
        select ${clients.id} as "clientId",
               ${clients.userId} as "userId",
               doc as document
        from ${clients},
             jsonb_array_elements(${clients.documents}) as doc
        where doc->>'id' = ${id}
        limit 1
      `);

      const clientDoc = clientDocResult.rows[0] as
        | { clientId: string; userId: string | null; document: any }
        | undefined;

      if (clientDoc?.document) {
        const doc =
          typeof clientDoc.document === 'string'
            ? (JSON.parse(clientDoc.document) as Record<string, any>)
            : (clientDoc.document as Record<string, any>);
        objectKey =
          doc.document_url ||
          doc.documentUrl ||
          doc.object_key ||
          doc.objectKey ||
          doc.url ||
          null;
        ownerId = doc.owner_id || doc.ownerId || clientDoc.userId || null;
      }
    }

    // Nettoyer l'object key (enlever les URLs malformées)
    objectKey = StorageService.extractKeyFromUrl(objectKey);

    if (!objectKey) {
      return res.status(404).json({ error: 'Document introuvable' });
    }

    // Vérification des permissions
    const isPrivileged =
      normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE;
    const isSelfRole =
      normalizedRole === SystemRole.CLIENT || normalizedRole === SystemRole.AGENT_TERRAIN;

    if (!isPrivileged) {
      if (!isSelfRole || !ownerId || ownerId !== user.id) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
    }

    // Si c'est une URL externe (OAuth), retourner directement
    if (objectKey.startsWith('http://') || objectKey.startsWith('https://')) {
      return res.json({ url: objectKey });
    }

    // Générer une URL presignée pour le document privé
    const url = await StorageService.getPresignedDownloadUrl(objectKey, 900);

    res.json({ url });
  } catch (error: any) {
    console.error('Download URL error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/storage/:key(*)
 * Delete file by key or URL
 */
router.delete('/:key(*)', requireAuth, async (req, res) => {
  try {
    const rawKey = req.params.key;

    if (!rawKey) {
      return res.status(400).json({ error: 'File key is required' });
    }

    // Utiliser deleteFileFromUrl qui gère le nettoyage automatiquement
    const deleted = await StorageService.deleteFileFromUrl(rawKey);

    res.json({ success: true, deleted });
  } catch (error: any) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ROUTES V2: ORGANISATION PAR ENTITÉ
// ============================================

/**
 * POST /api/storage/entity/upload
 * Upload avec organisation automatique par entité
 *
 * Body:
 * - file: fichier (multipart)
 * - fileType: 'profile' | 'kyc' | 'credit' | 'employe' | 'tontine' | 'misc'
 * - entityType: 'client' | 'user' | 'employe' | 'credit' | 'tontine'
 * - entityId: UUID de l'entité
 */
router.post('/entity/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const { fileType, entityType, entityId } = req.body;

    if (!fileType || !entityType || !entityId) {
      return res.status(400).json({
        error: 'Paramètres requis: fileType, entityType, entityId'
      });
    }

    // Validation des types
    // validFileTypes/validEntityTypes defined at module top from STORAGE_CONFIG
    // validEntityTypes defined at module top

    if (!validFileTypes.includes(fileType)) {
      return res.status(400).json({ error: `fileType invalide. Valeurs possibles: ${validFileTypes.join(', ')}` });
    }

    if (!validEntityTypes.includes(entityType)) {
      return res.status(400).json({ error: `entityType invalide. Valeurs possibles: ${validEntityTypes.join(', ')}` });
    }

    // Upload avec organisation par entité
    const key = await StorageService.uploadForEntity(
      req.file,
      fileType as StorageFileType,
      entityType as StorageEntityType,
      entityId
    );

    // Construire l'URL pour les fichiers publics
    const isPublic = isPublicFileType(fileType as StorageFileType);
    const url = isPublic ? StorageService.getPublicUrl(key) : null;

    res.json({
      success: true,
      key,
      url,
      fileType,
      entityType,
      entityId,
    });
  } catch (error: any) {
    console.error('Entity upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/storage/entity/presigned-url
 * Get presigned URL avec organisation par entité
 */
router.post('/entity/presigned-url', requireAuth, async (req, res) => {
  try {
    const { filename, contentType, fileType, entityType, entityId } = req.body;

    if (!filename || !contentType || !fileType || !entityType || !entityId) {
      return res.status(400).json({
        error: 'Paramètres requis: filename, contentType, fileType, entityType, entityId'
      });
    }

    // Validation des types
    // validFileTypes/validEntityTypes defined at module top from STORAGE_CONFIG
    // validEntityTypes defined at module top

    if (!validFileTypes.includes(fileType)) {
      return res.status(400).json({ error: `fileType invalide` });
    }

    if (!validEntityTypes.includes(entityType)) {
      return res.status(400).json({ error: `entityType invalide` });
    }

    const result = await StorageService.getPresignedUploadUrlForEntity(
      filename,
      contentType,
      fileType as StorageFileType,
      entityType as StorageEntityType,
      entityId
    );

    const isPublic = isPublicFileType(fileType as StorageFileType);

    res.json({
      uploadUrl: result.uploadUrl,
      key: result.objectKey,
      isPublic,
    });
  } catch (error: any) {
    console.error('Entity presigned URL error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/storage/entity/:entityType/:entityId
 * Supprime TOUS les fichiers d'une entité (cascade)
 * Réservé aux admins
 */
router.delete('/entity/:entityType/:entityId', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user as { id: string; role?: string };
    const normalizedRole = normalizeRole(user?.role);

    // Vérification admin uniquement
    if (normalizedRole !== SystemRole.ADMIN) {
      return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }

    const { entityType, entityId } = req.params;

    // validEntityTypes defined at module top
    if (!validEntityTypes.includes(entityType as StorageEntityType)) {
      return res.status(400).json({ error: 'entityType invalide' });
    }

    const result = await StorageService.deleteEntityFiles(
      entityType as StorageEntityType,
      entityId
    );

    res.json({
      success: true,
      ...result,
      totalDeleted: result.publicDeleted + result.privateDeleted,
    });
  } catch (error: any) {
    console.error('Entity files delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/storage/entity/:entityType/:entityId/files
 * Liste les fichiers d'une entité avec métadonnées
 */
router.get('/entity/:entityType/:entityId/files', requireAuth, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    // validEntityTypes defined at module top
    if (!validEntityTypes.includes(entityType as StorageEntityType)) {
      return res.status(400).json({ error: 'entityType invalide' });
    }

    const files = await StorageService.getEntityFiles(
      entityType as StorageEntityType,
      entityId
    );

    res.json({ entityType, entityId, files });
  } catch (error: any) {
    console.error('Entity files list error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/storage/entity/:entityType/:entityId/count
 * Compte les fichiers d'une entité
 */
router.get('/entity/:entityType/:entityId/count', requireAuth, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    // validEntityTypes defined at module top
    if (!validEntityTypes.includes(entityType as StorageEntityType)) {
      return res.status(400).json({ error: 'entityType invalide' });
    }

    const count = await StorageService.countEntityFiles(
      entityType as StorageEntityType,
      entityId
    );

    res.json({
      entityType,
      entityId,
      ...count,
      total: count.public + count.private,
    });
  } catch (error: any) {
    console.error('Entity files count error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
