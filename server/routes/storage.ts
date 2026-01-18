import { Router } from 'express';
import multer from 'multer';
import { StorageService } from '../services/storage-service';
import { requireAuth } from '../auth';
import { db } from '../db';
import { clients, documents } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { SystemRole, normalizeRole } from '@shared/types/roles';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé'));
    }
  }
});

/**
 * POST /api/storage/upload
 * Direct upload via backend
 */
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const { path = 'misc', isPublic = 'false' } = req.body;
    const isPublicBool = isPublic === 'true';

    const objectKey = await StorageService.uploadFile(
      req.file,
      path,
      isPublicBool
    );

    res.json({
      success: true,
      objectKey,
      url: isPublicBool ? StorageService.getPublicUrl(objectKey) : null
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/storage/presigned-url
 * Get presigned URL for direct client upload
 */
router.post('/presigned-url', requireAuth, async (req, res) => {
  try {
    const { filename, contentType, path = 'misc', isPublic = false } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename et contentType requis' });
    }

    const result = await StorageService.getPresignedUploadUrl(
      filename,
      contentType,
      path,
      isPublic
    );

    res.json(result);
  } catch (error: any) {
    console.error('Presigned URL error:', error);
    res.status(500).json({ error: error.message });
  }
});

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

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (isUuid) {
      const [document] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
      if (document) {
        objectKey = document.objectPath || null;
        if (document.referenceType === 'client' && document.referenceId) {
          const [client] = await db
            .select({ userId: clients.userId })
            .from(clients)
            .where(eq(clients.id, document.referenceId))
            .limit(1);
          ownerId = client?.userId || null;
        }
        if (!ownerId && document.uploadedBy) {
          ownerId = document.uploadedBy;
        }
      }
    }

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

    objectKey = typeof objectKey === 'string' && objectKey.length > 0 ? objectKey : null;

    if (!objectKey) {
      return res.status(404).json({ error: 'Document introuvable' });
    }

    const isPrivileged =
      normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE;
    const isSelfRole =
      normalizedRole === SystemRole.CLIENT || normalizedRole === SystemRole.AGENT_TERRAIN;

    if (!isPrivileged) {
      if (!isSelfRole || !ownerId || ownerId !== user.id) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
    }

    if (objectKey.startsWith('http') || objectKey.startsWith('data:')) {
      // Fix malformed URLs that have double prefixes (e.g., http://host/bucket/http://host/bucket/key)
      let normalizedUrl = objectKey;
      const doubleHttpMatch = objectKey.match(/^(https?:\/\/[^/]+\/[^/]+\/)(https?:\/\/.+)$/);
      if (doubleHttpMatch) {
        normalizedUrl = doubleHttpMatch[2];
      }
      return res.json({ url: normalizedUrl });
    }

    const url = await StorageService.getPresignedDownloadUrl(objectKey, 900);

    res.json({ url });
  } catch (error: any) {
    console.error('Download URL error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/storage/:key
 * Delete file
 */
router.delete('/:key', requireAuth, async (req, res) => {
  try {
    const { key } = req.params;
    const { isPublic = 'false' } = req.query;

    await StorageService.deleteFile(key, isPublic === 'true');

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
